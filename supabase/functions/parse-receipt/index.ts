import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from './cors.ts'
import { buildImageUserPrompt, buildTextRepairPrompt, buildVisionPolishPrompt, SYSTEM_PROMPT } from './prompt.ts'
import type { ReceiptPromptOptions } from './prompt.ts'

const validCategories = ['Grocery', 'Fuel', 'F&B', 'Retail', 'Service', 'Other']
const validDocTypes = ['Receipt', 'Invoice', 'Credit Note', 'Expense', 'E-invoice']
const validTags = ['Business', 'Personal', 'Tax Deductible', 'Pending']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let receiptId: string | null = null
  let parseMode = 'ocr'
  let previousStatus: string | null = null
  let enabledFields: string[] | null = null
  let requestedDocType: string | null = null
  let qrPayload: string | null = null

  try {
    assertEnv('SUPABASE_URL')
    assertEnv('SUPABASE_ANON_KEY')
    assertEnv('SUPABASE_SERVICE_ROLE_KEY')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401)
    }

    const body = await req.json()
    receiptId = body.receipt_id
    if (!receiptId) {
      return json({ error: 'receipt_id is required' }, 400)
    }
    parseMode = typeof body.mode === 'string' ? body.mode : 'ocr'
    enabledFields = Array.isArray(body.enabled_fields) ? body.enabled_fields.filter((field: unknown) => typeof field === 'string') : null
    requestedDocType = typeof body.doc_type === 'string' ? body.doc_type : null
    qrPayload = typeof body.qr_payload === 'string' && body.qr_payload.trim() ? body.qr_payload.trim() : null

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return json({ error: 'Invalid user session' }, 401)
    }

    const { data: receipt, error: receiptError } = await serviceClient
      .from('receipts')
      .select('id,user_id,file_path,processed_file_path,mime_type,filename,image_processing,file_hash,status,raw_ocr,raw_ai,doc_type,extra_fields')
      .eq('id', receiptId)
      .eq('user_id', user.id)
      .single()

    if (receiptError || !receipt) {
      return json({ error: 'Receipt not found' }, 404)
    }

    if (!receipt.file_path) {
      throw new Error('Receipt file_path is missing')
    }
    previousStatus = receipt.status || null

    await updateReceipt(serviceClient, receiptId, { status: 'processing', processing_stage: 'ocr_scanning', error_message: null })

    const ocrProvider = Deno.env.get('OCR_PROVIDER')?.toLowerCase()
    const useOpenAIVision = Deno.env.get('USE_OPENAI_VISION') === 'true'
    const storedQrPayload = receipt.extra_fields && typeof receipt.extra_fields === 'object'
      ? stringOrNull((receipt.extra_fields as Record<string, unknown>).qr_payload)
      : null
    const effectiveQrPayload = qrPayload ?? storedQrPayload
    const parseOptions: ReceiptPromptOptions = {
      enabledFields,
      qrPayload: effectiveQrPayload,
      schemaProfile: requestedDocType === 'E-invoice' || receipt.doc_type === 'E-invoice' || looksLikeEInvoiceQrPayload(effectiveQrPayload) ? 'einvoice' : 'standard',
    }

    const { aiJson, rawOcr } = parseMode === 'smart'
      ? await parseWithVisionModel(serviceClient, receipt, { forceDeepSeek: true, ...parseOptions })
      : parseMode === 'vision'
      ? await parseWithVisionModel(serviceClient, receipt, parseOptions)
      : parseMode === 'repair'
        ? await parseWithDeepSeekRepairMode(serviceClient, receipt, parseOptions)
      : ocrProvider === 'tencent'
      ? await parseWithTencentOCR(serviceClient, receipt, parseOptions)
      : useOpenAIVision
        ? await parseWithOpenAIVision(serviceClient, receipt, parseOptions)
        : parseManualDraft(receipt.filename)
    await updateReceipt(serviceClient, receiptId, { processing_stage: 'generating_preview' })

    const normalizedReceipt = normalizeReceipt(aiJson)
    mergeQrPayload(normalizedReceipt, receipt, effectiveQrPayload)
    const normalizedItems = normalizeItems(aiJson.items)
    const duplicatePatch = await findDuplicatePatch(serviceClient, receipt, normalizedReceipt)
    const warnings = buildWarnings(normalizedReceipt, normalizedItems, {
      duplicateOf: duplicatePatch.duplicate_of,
      duplicateScore: duplicatePatch.duplicate_score,
      imageProcessing: receipt.image_processing,
      rawAi: aiJson,
    })

    await serviceClient.from('receipt_items').delete().eq('receipt_id', receiptId)

    if (normalizedItems.length > 0) {
      const { error: itemError } = await serviceClient.from('receipt_items').insert(
        normalizedItems.map((item, index) => ({
          ...item,
          receipt_id: receiptId,
          user_id: receipt.user_id,
          sort_order: index,
        })),
      )
      if (itemError) throw itemError
    }

    const { data: updated, error: updateError } = await serviceClient
      .from('receipts')
      .update({
        ...normalizedReceipt,
        raw_ocr: rawOcr,
        raw_ai: aiJson,
        warnings,
        ...duplicatePatch,
        status: 'pending_review',
        processing_stage: 'ready_for_review',
        error_message: null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', receiptId)
      .select('*, receipt_items(*)')
      .single()

    if (updateError) throw updateError

    return json({ receipt: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    console.error('parse-receipt failed:', error)

    if (receiptId) {
      try {
        const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        const recoverableStatus = previousStatus && previousStatus !== 'processing' ? previousStatus : 'pending_review'
        await updateReceipt(serviceClient, receiptId, {
          status: parseMode === 'vision' || parseMode === 'smart' ? recoverableStatus : 'failed',
          processing_stage: 'ocr_failed',
          error_message: message,
          warnings: [{
            code: 'ocr_failed',
            severity: 'error',
            message,
          }],
        })
      } catch (updateError) {
        console.error('Failed to record parse error:', updateError)
      }
    }

    return json({ error: message }, 500)
  }
})

async function parseWithTencentOCR(client: any, receipt: any, options: ReceiptPromptOptions = {}): Promise<{ aiJson: Record<string, any>; rawOcr: string }> {
  assertEnv('TENCENT_SECRET_ID')
  assertEnv('TENCENT_SECRET_KEY')

  const monthlyLimit = normalizeLimit(Deno.env.get('OCR_FREE_MONTHLY_LIMIT'), 900)
  const period = new Date().toISOString().slice(0, 7)
  const { data: quota, error: quotaError } = await client.rpc('consume_ocr_quota', {
    p_user_id: receipt.user_id,
    p_period: period,
    p_provider: 'tencent',
    p_units: 1,
    p_limit: monthlyLimit,
  })

  if (quotaError) throw quotaError
  if (typeof quota !== 'number' || quota <= 0) {
    return parseManualDraftWithNote(
      receipt.filename,
      `Tencent OCR monthly free quota reached (${Math.abs(Number(quota) || 0)}/${monthlyLimit}). No OCR request was sent.`,
    )
  }

  const { fileBlob, mimeType, sourcePath } = await downloadReceiptImage(client, receipt)

  const base64File = await blobToBase64(fileBlob)
  if (!['image/jpeg', 'image/png'].includes(mimeType)) {
    return parseManualDraftWithNote(receipt.filename, 'Tencent OCR mode currently accepts JPEG and PNG receipts only.')
  }

  const ocrResult = await runTencentOCR(base64File)
  const rawOcr = ocrResult.text
  await updateReceipt(client, receipt.id, { processing_stage: 'ai_extracting' })
  const aiJson = inferReceiptFromOcrText(rawOcr, receipt.filename, {
    provider: 'tencent',
    quota_units_used: quota,
    quota_monthly_limit: monthlyLimit,
    request_id: ocrResult.requestId,
    angle: ocrResult.angle,
    language: ocrResult.language,
    line_count: ocrResult.lineCount,
    average_confidence: ocrResult.averageConfidence,
    image_source: sourcePath === receipt.processed_file_path ? 'processed' : 'original',
    image_processing: receipt.image_processing ?? null,
  })

  const repaired = await maybeRepairWithDeepSeek(client, receipt, rawOcr, aiJson, options)
  return { aiJson: repaired, rawOcr }
}

async function parseWithDeepSeekRepairMode(client: any, receipt: any, options: ReceiptPromptOptions = {}): Promise<{ aiJson: Record<string, any>; rawOcr: string }> {
  if (!receipt.raw_ocr) {
    throw new Error('No OCR text is available for DeepSeek text repair. Re-upload or run OCR first.')
  }
  if (!Deno.env.get('DEEPSEEK_API_KEY')) {
    throw new Error('Missing DEEPSEEK_API_KEY')
  }

  const initialJson = receipt.raw_ai && typeof receipt.raw_ai === 'object'
    ? receipt.raw_ai
    : inferReceiptFromOcrText(receipt.raw_ocr, receipt.filename, {
      provider: 'existing_raw_ocr',
      average_confidence: 0.5,
    })
  await updateReceipt(client, receipt.id, { processing_stage: 'ai_extracting' })
  const repaired = await runDeepSeekRepairWithQuota(client, receipt, receipt.raw_ocr, initialJson, options)
  return { aiJson: repaired, rawOcr: receipt.raw_ocr }
}

async function maybeRepairWithDeepSeek(
  client: any,
  receipt: any,
  rawOcr: string,
  initialAiJson: Record<string, any>,
  options: ReceiptPromptOptions = {},
): Promise<Record<string, any>> {
  const provider = Deno.env.get('AI_REPAIR_PROVIDER')?.toLowerCase()
  if (provider !== 'deepseek') return initialAiJson
  if (!shouldRepairStructuredReceipt(initialAiJson)) return initialAiJson
  if (!Deno.env.get('DEEPSEEK_API_KEY')) {
    return appendParserNote(initialAiJson, 'DeepSeek text repair was enabled but DEEPSEEK_API_KEY is missing; skipped repair.')
  }

  return runDeepSeekRepairWithQuota(client, receipt, rawOcr, initialAiJson, options)
}

async function runDeepSeekRepairWithQuota(
  client: any,
  receipt: any,
  rawOcr: string,
  initialAiJson: Record<string, any>,
  options: ReceiptPromptOptions = {},
): Promise<Record<string, any>> {
  const monthlyLimit = normalizeLimit(Deno.env.get('DEEPSEEK_MONTHLY_LIMIT'), 500)
  const period = new Date().toISOString().slice(0, 7)
  const { data: quota, error: quotaError } = await client.rpc('consume_ocr_quota', {
    p_user_id: receipt.user_id,
    p_period: period,
    p_provider: 'deepseek_v4',
    p_units: 1,
    p_limit: monthlyLimit,
  })

  if (quotaError) throw quotaError
  if (typeof quota !== 'number' || quota <= 0) {
    return appendParserNote(
      initialAiJson,
      `DeepSeek monthly repair quota reached (${Math.abs(Number(quota) || 0)}/${monthlyLimit}); skipped repair.`,
    )
  }

  try {
    const repaired = applyItemQualityGate(rawOcr, initialAiJson, await runDeepSeekTextRepair(rawOcr, initialAiJson, options))
    repaired.parser_meta = {
      ...(repaired.parser_meta ?? {}),
      provider: 'deepseek_v4_text_repair',
      quota_units_used: quota,
      quota_monthly_limit: monthlyLimit,
      repaired_from: initialAiJson.parser ?? 'tencent_ocr_rules',
    }
    repaired.parser = 'deepseek_v4_text_repair'
    repaired.parser_note = repaired.parser_note
      ? `${repaired.parser_note} DeepSeek V4 repaired structured fields from Tencent OCR text. Please review against the receipt image.`
      : 'DeepSeek V4 repaired structured fields from Tencent OCR text. Please review against the receipt image.'
    return repaired
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DeepSeek repair error'
    console.error('DeepSeek text repair failed:', error)
    return appendParserNote(initialAiJson, `DeepSeek text repair failed: ${message}`)
  }
}

async function parseWithVisionModel(
  client: any,
  receipt: any,
  options: ReceiptPromptOptions & { forceDeepSeek?: boolean } = {},
): Promise<{ aiJson: Record<string, any>; rawOcr: string }> {
  const provider = Deno.env.get('VISION_PROVIDER')?.toLowerCase() || 'qwen'
  if (provider !== 'qwen') {
    throw new Error(`Unsupported VISION_PROVIDER: ${provider}`)
  }
  assertEnv('DASHSCOPE_API_KEY')

  const monthlyLimit = normalizeLimit(Deno.env.get('VISION_MONTHLY_LIMIT'), 100)
  const period = new Date().toISOString().slice(0, 7)
  const { data: quota, error: quotaError } = await client.rpc('consume_ocr_quota', {
    p_user_id: receipt.user_id,
    p_period: period,
    p_provider: 'qwen_vl',
    p_units: 1,
    p_limit: monthlyLimit,
  })

  if (quotaError) throw quotaError
  if (typeof quota !== 'number' || quota <= 0) {
    return parseManualDraftWithNote(
      receipt.filename,
      `Qwen VL monthly reparse quota reached (${Math.abs(Number(quota) || 0)}/${monthlyLimit}). No vision model request was sent.`,
    )
  }

  const { fileBlob, mimeType, sourcePath } = await downloadReceiptImage(client, receipt)
  const base64File = await blobToBase64(fileBlob)
  await updateReceipt(client, receipt.id, { processing_stage: 'ai_extracting' })
  let aiJson = await runQwenVision(base64File, mimeType, options)
  aiJson.parser_meta = {
    ...(aiJson.parser_meta ?? {}),
    provider: 'qwen_vl',
    quota_units_used: quota,
    quota_monthly_limit: monthlyLimit,
    image_source: sourcePath === receipt.processed_file_path ? 'processed' : 'original',
    image_processing: receipt.image_processing ?? null,
  }
  aiJson.parser = options.forceDeepSeek ? 'smart_qwen_vl' : 'qwen_vl'
  aiJson.parser_note = options.forceDeepSeek
    ? 'Smart parse used Qwen VL to read the receipt image, then DeepSeek to verify structure and arithmetic.'
    : 'Qwen VL parsed the receipt image directly. Please review against the receipt image.'
  aiJson = await maybePolishVisionWithDeepSeek(client, receipt, aiJson, options)

  return {
    aiJson,
    rawOcr: 'Parsed directly from receipt image with Qwen VL. No separate OCR text was generated.',
  }
}

async function maybePolishVisionWithDeepSeek(
  client: any,
  receipt: any,
  visionJson: Record<string, any>,
  options: ReceiptPromptOptions & { forceDeepSeek?: boolean } = {},
): Promise<Record<string, any>> {
  const provider = (Deno.env.get('VISION_REPAIR_PROVIDER') || Deno.env.get('AI_REPAIR_PROVIDER'))?.toLowerCase()
  if (!options.forceDeepSeek && provider !== 'deepseek') return visionJson
  if (!Deno.env.get('DEEPSEEK_API_KEY')) {
    const note = options.forceDeepSeek
      ? 'Smart parse requires DeepSeek polish, but DEEPSEEK_API_KEY is missing; Qwen VL result was kept without DeepSeek verification.'
      : 'DeepSeek vision polish was enabled but DEEPSEEK_API_KEY is missing; skipped polish.'
    return appendParserNote(visionJson, note)
  }

  const monthlyLimit = normalizeLimit(Deno.env.get('DEEPSEEK_MONTHLY_LIMIT'), 500)
  const period = new Date().toISOString().slice(0, 7)
  const { data: quota, error: quotaError } = await client.rpc('consume_ocr_quota', {
    p_user_id: receipt.user_id,
    p_period: period,
    p_provider: 'deepseek_v4',
    p_units: 1,
    p_limit: monthlyLimit,
  })

  if (quotaError) throw quotaError
  if (typeof quota !== 'number' || quota <= 0) {
    return appendParserNote(
      visionJson,
      `DeepSeek monthly polish quota reached (${Math.abs(Number(quota) || 0)}/${monthlyLimit}); skipped polish.`,
    )
  }

  try {
    const polished = await runDeepSeekVisionPolish(visionJson, options)
    polished.parser_meta = {
      ...(polished.parser_meta ?? {}),
      provider: 'qwen_vl_deepseek_polish',
      qwen_provider: visionJson.parser_meta?.provider ?? 'qwen_vl',
      deepseek_quota_units_used: quota,
      deepseek_quota_monthly_limit: monthlyLimit,
    }
    polished.parser = 'qwen_vl_deepseek_polish'
    polished.parser_note = polished.parser_note
      ? `${polished.parser_note} Qwen VL read the image; DeepSeek polished structure and arithmetic without rewriting item names.`
      : 'Qwen VL read the image; DeepSeek polished structure and arithmetic without rewriting item names.'
    return polished
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DeepSeek polish error'
    console.error('DeepSeek vision polish failed:', error)
    return appendParserNote(visionJson, `DeepSeek vision polish failed: ${message}`)
  }
}

async function parseWithOpenAIVision(client: any, receipt: any, options: ReceiptPromptOptions = {}): Promise<{ aiJson: Record<string, any>; rawOcr: string }> {
  assertEnv('OPENAI_API_KEY')

  const { fileBlob, mimeType, sourcePath } = await downloadReceiptImage(client, receipt)

  const base64File = await blobToBase64(fileBlob)
  await updateReceipt(client, receipt.id, { processing_stage: 'ai_extracting' })
  const aiJson = await runOpenAIVision(base64File, mimeType, options)
  aiJson.parser_meta = {
    ...(aiJson.parser_meta ?? {}),
    image_source: sourcePath === receipt.processed_file_path ? 'processed' : 'original',
    image_processing: receipt.image_processing ?? null,
  }
  return {
    aiJson,
    rawOcr: 'Parsed directly from receipt image with OpenAI vision. No separate OCR text was generated.',
  }
}

async function downloadReceiptImage(client: any, receipt: any): Promise<{ fileBlob: Blob; mimeType: string; sourcePath: string }> {
  const sourcePath = receipt.processed_file_path || receipt.file_path
  if (!sourcePath) {
    throw new Error('Receipt file_path is missing')
  }

  const { data: fileBlob, error: downloadError } = await client.storage
    .from('receipts')
    .download(sourcePath)
  if (downloadError || !fileBlob) {
    throw downloadError ?? new Error('Failed to download receipt file')
  }

  const mimeType = sourcePath === receipt.processed_file_path
    ? 'image/jpeg'
    : receipt.mime_type || fileBlob.type || 'application/octet-stream'

  return { fileBlob, mimeType, sourcePath }
}

function parseManualDraft(filename: string | null): { aiJson: Record<string, any>; rawOcr: string } {
  return parseManualDraftWithNote(
    filename,
    'No OCR/AI provider is enabled. Please review and enter receipt fields manually.',
  )
}

function parseManualDraftWithNote(filename: string | null, note: string): { aiJson: Record<string, any>; rawOcr: string } {
  return {
    aiJson: {
      merchant_name: filename ? filename.replace(/\.[^.]+$/, '') : 'Manual review required',
      company_reg_no: null,
      address: null,
      phone: null,
      invoice_no: null,
      date: null,
      time: null,
      category: 'Other',
      doc_type: 'Receipt',
      subtotal: 0,
      discount: 0,
      tax: 0,
      service_charge: 0,
      rounding: 0,
      grand_total: 0,
      payment_method: null,
      change: 0,
      subsidy_details: null,
      tags: ['Pending'],
      confidence_score: 0,
      items: [],
      parser: 'manual_fallback',
      parser_note: note,
    },
    rawOcr: `Manual fallback mode: ${note}`,
  }
}

async function runTencentOCR(base64File: string): Promise<{
  text: string
  requestId: string | null
  angle: number | null
  language: string | null
  lineCount: number
  averageConfidence: number
}> {
  const action = Deno.env.get('TENCENT_OCR_ACTION') || 'GeneralBasicOCR'
  const payload = JSON.stringify({
    ImageBase64: base64File,
    LanguageType: Deno.env.get('TENCENT_OCR_LANGUAGE') || 'may',
  })
  const response = await callTencentCloudApi(action, '2018-11-19', payload)
  const data = await response.json()
  const result = data.Response

  if (!response.ok || result?.Error) {
    throw new Error(result?.Error?.Message || `Tencent OCR failed with HTTP ${response.status}`)
  }

  const detections = Array.isArray(result?.TextDetections) ? result.TextDetections : []
  const lines = detections
    .map((item: Record<string, unknown>) => String(item.DetectedText ?? '').trim())
    .filter(Boolean)
  const confidences = detections
    .map((item: Record<string, unknown>) => Number(item.Confidence))
    .filter((value: number) => Number.isFinite(value))
  const averageConfidence = confidences.length > 0
    ? confidences.reduce((sum: number, value: number) => sum + value, 0) / confidences.length / 100
    : 0

  return {
    text: lines.join('\n'),
    requestId: result?.RequestId ?? null,
    angle: typeof result?.Angle === 'number' ? result.Angle : null,
    language: result?.Language ?? null,
    lineCount: lines.length,
    averageConfidence: clamp(averageConfidence, 0, 1),
  }
}

async function callTencentCloudApi(action: string, version: string, payload: string): Promise<Response> {
  const secretId = Deno.env.get('TENCENT_SECRET_ID')!
  const secretKey = Deno.env.get('TENCENT_SECRET_KEY')!
  const service = 'ocr'
  const host = 'ocr.tencentcloudapi.com'
  const region = Deno.env.get('TENCENT_OCR_REGION') || 'ap-guangzhou'
  const algorithm = 'TC3-HMAC-SHA256'
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10)
  const contentType = 'application/json; charset=utf-8'

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedRequestPayload = await sha256Hex(payload)
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest)
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`
  const secretDate = await hmacSha256(encodeUtf8(`TC3${secretKey}`), date)
  const secretService = await hmacSha256(secretDate, service)
  const secretSigning = await hmacSha256(secretService, 'tc3_request')
  const signature = bytesToHex(await hmacSha256(secretSigning, stringToSign))
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': timestamp,
      'X-TC-Version': version,
      'X-TC-Region': region,
    },
    body: payload,
  })
}

async function runOpenAIVision(base64File: string, mimeType: string, options: ReceiptPromptOptions = {}): Promise<Record<string, any>> {
  if (!['image/jpeg', 'image/png'].includes(mimeType)) {
    throw new Error('OpenAI vision fallback currently supports JPEG and PNG receipts only.')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildImageUserPrompt(options) },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64File}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error?.message || 'OpenAI receipt parsing failed')
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned an empty response')
  return parseJsonObject(content)
}

async function runQwenVision(base64File: string, mimeType: string, options: ReceiptPromptOptions = {}): Promise<Record<string, any>> {
  if (!['image/jpeg', 'image/png'].includes(mimeType)) {
    throw new Error('Qwen vision reparse currently supports JPEG and PNG receipts only.')
  }

  const endpoint = Deno.env.get('QWEN_BASE_URL') || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('DASHSCOPE_API_KEY')!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('QWEN_VL_MODEL') || 'qwen3.6-plus',
      input: {
        messages: [
          {
            role: 'system',
            content: [{ text: SYSTEM_PROMPT }],
          },
          {
            role: 'user',
            content: [
              { image: `data:${mimeType};base64,${base64File}` },
              { text: buildImageUserPrompt(options) },
            ],
          },
        ],
      },
      parameters: {
        temperature: 0,
      },
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Qwen vision receipt parsing failed')
  }

  const content = extractQwenTextContent(payload)
  if (!content) throw new Error('Qwen vision returned an empty response')
  return parseJsonObject(content)
}

function extractQwenTextContent(payload: Record<string, any>): string | null {
  const content = payload.output?.choices?.[0]?.message?.content ?? payload.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : '')
      .filter(Boolean)
    return textParts.length > 0 ? textParts.join('\n') : null
  }
  if (typeof payload.output?.text === 'string') return payload.output.text
  return null
}

async function runDeepSeekTextRepair(rawOcr: string, initialAiJson: Record<string, any>, options: ReceiptPromptOptions = {}): Promise<Record<string, any>> {
  const baseUrl = Deno.env.get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com'
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('DEEPSEEK_MODEL') || 'deepseek-v4-flash',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildTextRepairPrompt(rawOcr, initialAiJson, options),
        },
      ],
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error?.message || 'DeepSeek text repair failed')
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek returned an empty response')
  return parseJsonObject(content)
}

async function runDeepSeekVisionPolish(visionJson: Record<string, any>, options: ReceiptPromptOptions = {}): Promise<Record<string, any>> {
  const baseUrl = Deno.env.get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com'
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('DEEPSEEK_API_KEY')!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('DEEPSEEK_MODEL') || 'deepseek-v4-flash',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildVisionPolishPrompt(visionJson, options),
        },
      ],
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error?.message || 'DeepSeek vision polish failed')
  }

  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek returned an empty response')
  return parseJsonObject(content)
}

function inferReceiptFromOcrText(text: string, filename: string | null, meta: Record<string, unknown>): Record<string, any> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const merchantName = inferMerchantName(lines, filename)
  const items = inferItems(lines)
  const grandTotal = inferGrandTotal(lines)
  const subtotal = inferSubtotal(lines) || sumItems(items) || grandTotal
  const date = inferDate(lines)
  const time = inferTime(lines)
  const invoiceNo = inferInvoiceNo(lines)
  const phone = inferPhone(lines)

  return {
    merchant_name: merchantName,
    company_reg_no: inferCompanyRegNo(lines),
    address: inferAddress(lines, merchantName),
    phone,
    invoice_no: invoiceNo,
    date,
    time,
    category: inferCategory(lines, merchantName),
    doc_type: 'Receipt',
    subtotal,
    discount: 0,
    tax: 0,
    service_charge: 0,
    rounding: inferRounding(lines),
    grand_total: grandTotal,
    payment_method: inferPaymentMethod(lines),
    change: inferChange(lines),
    subsidy_details: null,
    tags: ['Pending'],
    confidence_score: typeof meta.average_confidence === 'number' ? meta.average_confidence : 0.5,
    items,
    parser: 'tencent_ocr_rules',
    parser_note: 'Tencent OCR populated text fields with lightweight rules. Please review totals and line items manually.',
    ocr_meta: meta,
  }
}

function inferMerchantName(lines: string[], filename: string | null): string | null {
  const ignored = /^(receipt|invoice|tax invoice|cash bill|official receipt|welcome|tel|phone|date|time|gst|sst|total|amount|qty|description)\b/i
  const candidate = lines.find((line) =>
    line.length >= 3 &&
    !ignored.test(line) &&
    !/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(line) &&
    !/^\W*\d+([.,]\d{2})?\W*$/.test(line)
  )
  if (candidate) return candidate.slice(0, 160)
  return filename ? filename.replace(/\.[^.]+$/, '') : null
}

function inferGrandTotal(lines: string[]): number {
  const preferred = findAmountNearLabels(lines, [
    /net\s+total/i,
    /grand\s+total/i,
    /total\s+amount/i,
    /amount\s+due/i,
    /total\s+due/i,
    /^total\b/i,
  ])
  if (preferred > 0) return preferred

  const joined = lines.join('\n')
  const amounts = [...joined.matchAll(/(?<!\d)(\d{1,6}[,.]\d{2})(?!\d)/g)]
    .map((match) => normalizeMoney(match[1].replace(',', '.')))
    .filter((value) => value > 0)
  return amounts.length > 0 ? Math.max(...amounts) : 0
}

function inferSubtotal(lines: string[]): number {
  return findAmountNearLabels(lines, [/sub\s*total/i, /sut\s*total/i, /subtotal/i])
}

function inferRounding(lines: string[]): number {
  return findAmountNearLabels(lines, [/rounding/i, /round\s*adj/i])
}

function findAmountNearLabels(lines: string[], labels: RegExp[]): number {
  for (const label of labels) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!label.test(lines[index])) continue

      const sameLineAmount = extractLastAmount(lines[index])
      if (sameLineAmount > 0 || /^\s*[.-]?\d*[,.]\d{2}\s*$/.test(lines[index])) {
        return sameLineAmount
      }

      const lookahead = lines.slice(index + 1, index + 5)
      for (const line of lookahead) {
        const amount = extractLastAmount(line)
        if (amount > 0 || /^\s*[.-]?\d*[,.]\d{2}\s*$/.test(line)) {
          return amount
        }
      }
    }
  }
  return 0
}

function extractLastAmount(value: string): number {
  const matches = [...value.matchAll(/(?<!\d)(\d{1,6}[,.]\d{2}|\.\d{2})(?!\d)/g)]
  if (matches.length === 0) return 0
  return normalizeMoney(matches[matches.length - 1][1].replace(',', '.'))
}

function inferDate(lines: string[]): string | null {
  const text = lines.join('\n')
  const match = text.match(/(?<!\d)(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?!\d)/)
  if (!match) return null

  const first = Number(match[1])
  const second = Number(match[2])
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3])
  const day = first > 12 ? first : second > 12 ? second : first
  const month = first > 12 ? second : second > 12 ? first : second
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function inferTime(lines: string[]): string | null {
  const match = lines.join('\n').match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?:\s?(am|pm))?(?!\d)/i)
  return match ? match[0] : null
}

function inferInvoiceNo(lines: string[]): string | null {
  for (const line of lines) {
    const explicit = line.match(/\b(?:invoice|inv|receipt|rcpt|bill|transaction|trans|ref)\s*(?:no|number|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{3,})\b/i)
    if (explicit) return explicit[1].slice(0, 80)

    const noOnly = line.match(/\bno\.?\s*[:#-]\s*([A-Z0-9][A-Z0-9/-]{3,})\b/i)
    if (noOnly) return noOnly[1].slice(0, 80)
  }
  return null
}

function inferPhone(lines: string[]): string | null {
  const phoneLine = lines.find((line) => /\b(?:tel|phone|contact|hp|mobile)\b/i.test(line))
  if (!phoneLine) return null
  const match = phoneLine.match(/(?:\+?60|0)\s?\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/)
  return match ? match[0] : null
}

function inferCompanyRegNo(lines: string[]): string | null {
  const text = lines.join('\n')
  const match = text.match(/(?:reg(?:istration)?\s*no|company\s*no|co\.?\s*no|ssm)\s*[:#-]?\s*([A-Z0-9-]{5,})/i)
  if (match) return match[1].slice(0, 80)
  const standalone = lines.find((line) => /^\d{8,14}\s*\([A-Z0-9-]{4,}\)$/i.test(line))
  if (standalone) return standalone.slice(0, 80)
  return null
}

function inferAddress(lines: string[], merchantName: string | null): string | null {
  const start = merchantName ? lines.findIndex((line) => line === merchantName) + 1 : 0
  const addressLines = lines
    .slice(Math.max(0, start), Math.max(0, start) + 4)
    .filter((line) => /(jalan|jln|lorong|taman|mall|plaza|selangor|kuala|lumpur|penang|johor|melaka|perak|sabah|sarawak|\d{5})/i.test(line))
  return addressLines.length > 0 ? addressLines.join(', ').slice(0, 300) : null
}

function inferPaymentMethod(lines: string[]): string | null {
  const text = lines.join('\n')
  if (/visa|mastercard|card|debit|credit/i.test(text)) return 'Card'
  if (/touch\s?['-]?n\s?go|tng|ewallet|e-wallet|qr\s?pay|boost|grabpay/i.test(text)) return 'E-wallet'
  if (/mykasih|hykasih/i.test(text)) return 'MyKasih'
  if (/cash|tunai/i.test(text)) return 'Cash'
  return null
}

function inferChange(lines: string[]): number {
  return findAmountNearLabels(lines, [/change/i, /balance/i])
}

function inferItems(lines: string[]) {
  const items: Array<{ name: string; qty: number; unit: string | null; unit_price: number; line_total: number }> = []
  const stopLine = /(?:sub\s*total|sut\s*total|subtotal|rounding|net\s+total|grand\s+total|change|mykasih|hykasih|cash|visa|mastercard|visit\s+below)/i

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (stopLine.test(line)) break

    const inline = line.match(/^\s*(?:\d{3,8}\s+)?(.+?)\s+(?:rm|rh|rn|km)?\s*(\d{1,6}[,.]\d{2})\s*$/i)
    if (inline && isLikelyItemName(inline[1])) {
      const amount = normalizeMoney(inline[2].replace(',', '.'))
      items.push(buildItem(inline[1], amount))
      continue
    }

    const nextAmount = extractLastAmount(lines[index + 1] || '')
    if (nextAmount > 0 && isLikelyItemName(line)) {
      items.push(buildItem(line, nextAmount))
      index += 1
      continue
    }

  const twoAheadAmount = extractLastAmount(lines[index + 2] || '')
    if (isLikelyItemName(line) && isCurrencyMarker(lines[index + 1] || '') && twoAheadAmount > 0) {
      items.push(buildItem(line, twoAheadAmount))
      index += 2
      continue
    }

    if (/^\s*(?:\d{3,8}\s+)?[A-Z0-9][A-Z0-9\s&'()./-]{4,}\s+(?:rm|rh|rn|km)\s*$/i.test(line) && twoAheadAmount > 0) {
      items.push(buildItem(line, twoAheadAmount))
      index += 2
    }
  }

  return items
}

function isLikelyItemName(line: string): boolean {
  const normalized = line.trim()
  if (normalized.length < 4) return false
  if (/^\d{1,2}[:.]\d{2}/.test(normalized)) return false
  if (/(invoice|receipt|date|time|total|rounding|change|visit|http|www)/i.test(normalized)) return false
  if (/^\W*\d+([.,]\d{2})?\W*$/.test(normalized)) return false
  return /^[0-9A-Z]/i.test(normalized)
}

function buildItem(name: string, amount: number) {
  const cleanedName = name
    .replace(/^\d{3,8}\s+/, '')
    .replace(/\s+(?:rm|rh|rn|km)\s*$/i, '')
    .trim()
  return {
    name: normalizeProductName(cleanedName),
    qty: 1,
    unit: null,
    unit_price: amount,
    line_total: amount,
  }
}

function isCurrencyMarker(line: string): boolean {
  return /^(?:rm|rh|rn|km)$/i.test(line.trim())
}

function normalizeProductName(name: string): string {
  return name
    .replace(/\bCHIPSHORE\b/gi, 'CHIPSMORE')
    .replace(/\bTOASTEN\b/gi, 'TOASTEM')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferCategory(lines: string[], merchantName: string | null): string {
  const text = `${merchantName || ''}\n${lines.join('\n')}`
  if (/shell|petronas|petron|bhp|caltex|fuel|ron\s?95|diesel/i.test(text)) return 'Fuel'
  if (/restaurant|cafe|kopitiam|kitchen|food|burger|pizza|hai\s*di\s*lao/i.test(text)) return 'F&B'
  if (/speed\s*mart|grocery|market|mart|supermarket|tesco|lotus|aeon|giant|mydin|gardenia|chipsmore/i.test(text)) return 'Grocery'
  if (/clinic|pharmacy|service|repair|laundry/i.test(text)) return 'Service'
  if (/store|retail|shop|fashion|hardware/i.test(text)) return 'Retail'
  return 'Other'
}

function sumItems(items: Array<{ line_total: number }>): number {
  return normalizeMoney(items.reduce((sum, item) => sum + normalizeMoney(item.line_total), 0))
}

function shouldRepairStructuredReceipt(input: Record<string, any>): boolean {
  const items = Array.isArray(input.items) ? input.items : []
  const itemsTotal = sumItems(items)
  const printedTotal = normalizeMoney(input.grand_total)
  const calculatedTotal = normalizeMoney(
    itemsTotal
      - normalizeMoney(input.discount)
      + normalizeMoney(input.tax)
      + normalizeMoney(input.service_charge)
      + normalizeMoney(input.rounding),
  )
  const confidence = Number(input.confidence_score) || 0

  if (items.length === 0) return true
  if (itemQualitySummary(items).suspiciousCount > 0) return true
  if (printedTotal > 0 && Math.abs(calculatedTotal - printedTotal) > 0.05) return true
  if (confidence > 0 && confidence < 0.72) return true
  return false
}

function applyItemQualityGate(
  _rawOcr: string,
  initialAiJson: Record<string, any>,
  repaired: Record<string, any>,
): Record<string, any> {
  const repairedItems = Array.isArray(repaired.items) ? repaired.items : []
  const summary = itemQualitySummary(repairedItems)
  if (summary.total === 0) return repaired

  const shouldGate = summary.suspiciousCount >= 2 || summary.suspiciousCount / summary.total >= 0.4
  if (!shouldGate) return repaired

  const initialItems = Array.isArray(initialAiJson.items) ? initialAiJson.items : []
  const initialSummary = itemQualitySummary(initialItems)
  const fallbackItems = initialSummary.total > 0 && initialSummary.suspiciousCount < summary.suspiciousCount
    ? initialItems
    : summary.cleanItems

  return appendParserNote({
    ...repaired,
    items: fallbackItems,
    confidence_score: Math.min(Number(repaired.confidence_score) || 0.5, 0.45),
    parser_meta: {
      ...(repaired.parser_meta ?? {}),
      item_quality: 'low',
      suspicious_item_count: summary.suspiciousCount,
      total_item_count: summary.total,
    },
  }, 'DeepSeek text repair completed, but line item names look unreliable because OCR text is damaged. Totals were kept; review items manually or run a vision model reparse.')
}

function itemQualitySummary(items: unknown[]) {
  const cleanItems = items.filter((item) => {
    if (!item || typeof item !== 'object') return false
    return !isSuspiciousItemName(String((item as Record<string, unknown>).name ?? ''))
  })
  return {
    total: items.length,
    cleanItems,
    suspiciousCount: items.length - cleanItems.length,
  }
}

function isSuspiciousItemName(name: string): boolean {
  const value = name.trim()
  if (value.length < 2) return true
  if (/[\u3400-\u9fff]/.test(value)) return false
  if (/^[\W\d_]+$/.test(value)) return true
  if (/[#*()[\]{}<>]/.test(value)) return true

  const letters = value.replace(/[^A-Za-z]/g, '')
  if (letters.length === 0) return true
  const vowels = letters.match(/[AEIOU]/gi)?.length ?? 0
  const words = value.split(/\s+/).filter(Boolean)
  if (letters.length >= 4 && vowels === 0) return true
  if (words.length <= 2 && words.every((word) => word.replace(/[^A-Za-z]/g, '').length <= 3) && vowels <= 1) return true
  return false
}

function appendParserNote(input: Record<string, any>, note: string): Record<string, any> {
  return {
    ...input,
    parser_note: input.parser_note ? `${input.parser_note} ${note}` : note,
  }
}

function normalizeReceipt(input: Record<string, any>) {
  const category = validCategories.includes(input.category) ? input.category : 'Other'
  const docType = validDocTypes.includes(input.doc_type) ? input.doc_type : 'Receipt'
  const tags = Array.isArray(input.tags)
    ? input.tags.filter((tag: string) => validTags.includes(tag))
    : ['Pending']

  return {
    merchant_name: stringOrNull(input.merchant_name),
    company_reg_no: stringOrNull(input.company_reg_no),
    address: stringOrNull(input.address),
    phone: stringOrNull(input.phone),
    invoice_no: stringOrNull(input.invoice_no),
    date: normalizeDate(input.date),
    time: stringOrNull(input.time),
    category,
    doc_type: docType,
    custom_doc_type: stringOrNull(input.custom_doc_type),
    subtotal: normalizeMoney(input.subtotal),
    discount: normalizeMoney(input.discount),
    tax: normalizeMoney(input.tax),
    service_charge: normalizeMoney(input.service_charge),
    rounding: normalizeMoney(input.rounding),
    grand_total: normalizeMoney(input.grand_total),
    payment_method: stringOrNull(input.payment_method),
    change: normalizeMoney(input.change),
    subsidy_details: input.subsidy_details && typeof input.subsidy_details === 'object' ? input.subsidy_details : null,
    extra_fields: input.extra_fields && typeof input.extra_fields === 'object' ? normalizeExtraFields(input.extra_fields as Record<string, unknown>) : null,
    tags,
    confidence_score: clamp(Number(input.confidence_score) || 0, 0, 1),
  }
}

function mergeQrPayload(normalizedReceipt: Record<string, any>, receipt: Record<string, any>, qrPayload: string | null) {
  const normalizedExtraFields = normalizedReceipt.extra_fields && typeof normalizedReceipt.extra_fields === 'object'
    ? normalizedReceipt.extra_fields as Record<string, unknown>
    : {}
  const storedExtraFields = receipt.extra_fields && typeof receipt.extra_fields === 'object'
    ? receipt.extra_fields as Record<string, unknown>
    : {}
  const payload = qrPayload
    ?? stringOrNull(normalizedExtraFields.qr_payload)
    ?? stringOrNull(storedExtraFields.qr_payload)

  if (!payload) return

  normalizedReceipt.extra_fields = {
    ...normalizedExtraFields,
    qr_payload: payload,
  }

  if (looksLikeEInvoiceQrPayload(payload)) {
    normalizedReceipt.doc_type = 'E-invoice'
  }
}

function looksLikeEInvoiceQrPayload(payload: string | null | undefined): boolean {
  if (!payload) return false
  return /myinvois|e-?invoice|invoice|lhdn|hasil|tax|uuid|validation/i.test(payload)
}

function normalizeExtraFields(input: Record<string, unknown>) {
  const extraFields: Record<string, unknown> = {}
  const stringKeys = [
    'supplier_name',
    'buyer_name',
    'supplier_tin',
    'buyer_tin',
    'sst_no',
    'invoice_uuid',
    'validation_link',
    'qr_payload',
    'invoice_type',
  ]

  for (const key of stringKeys) {
    extraFields[key] = stringOrNull(input[key])
  }

  extraFields.tax_amount = normalizeMoney(input.tax_amount)
  return extraFields
}

function normalizeItems(items: unknown) {
  if (!Array.isArray(items)) return []

  return items
    .map((raw) => {
      const item = raw as Record<string, unknown>
      return {
        name: String(item.name ?? '').trim(),
        qty: normalizeQuantity(item.qty),
        unit: stringOrNull(item.unit),
        unit_price: normalizeMoney(item.unit_price),
        line_total: normalizeMoney(item.line_total) || normalizeMoney(normalizeQuantity(item.qty) * normalizeMoney(item.unit_price)),
      }
    })
    .filter((item) => item.name.length > 0)
}

async function findDuplicatePatch(client: any, receipt: any, normalizedReceipt: Record<string, any>) {
  const { data: candidates, error } = await client
    .from('receipts')
    .select('id,file_hash,merchant_name,invoice_no,date,grand_total,deleted_at,image_processing,raw_ocr')
    .eq('user_id', receipt.user_id)
    .neq('id', receipt.id)
    .is('deleted_at', null)

  if (error) throw error

  const best = (candidates ?? [])
    .map((candidate: Record<string, any>) => scoreDuplicate(receipt, normalizedReceipt, candidate))
    .filter(Boolean)
    .sort((left: any, right: any) => right.score - left.score)[0]

  return best
    ? { duplicate_of: best.id, duplicate_score: best.score }
    : { duplicate_of: null, duplicate_score: null }
}

function scoreDuplicate(receipt: any, normalizedReceipt: Record<string, any>, candidate: Record<string, any>) {
  let score = 0

  if (receipt.file_hash && candidate.file_hash && receipt.file_hash === candidate.file_hash) {
    score += 1
  }

  if (sameText(normalizedReceipt.invoice_no, candidate.invoice_no) && sameText(normalizedReceipt.merchant_name, candidate.merchant_name)) {
    score += 0.8
  }

  if (
    sameText(normalizedReceipt.merchant_name, candidate.merchant_name)
    && sameDate(normalizedReceipt.date, candidate.date)
    && sameAmount(normalizedReceipt.grand_total, candidate.grand_total)
  ) {
    score += 0.7
  }

  if (sameText(normalizedReceipt.invoice_no, candidate.invoice_no) && sameDate(normalizedReceipt.date, candidate.date)) {
    score += 0.5
  }

  if (
    similarText(normalizedReceipt.merchant_name, candidate.merchant_name)
    && nearDate(normalizedReceipt.date, candidate.date)
    && similarAmount(normalizedReceipt.grand_total, candidate.grand_total)
  ) {
    score += 0.45
  }

  if (tokenSimilarity(receipt.raw_ocr, candidate.raw_ocr) >= 0.72) {
    score += 0.55
  }

  const receiptHash = readPerceptualHash(receipt)
  const candidateHash = readPerceptualHash(candidate)
  if (receiptHash && candidateHash && hammingDistance(receiptHash, candidateHash) <= 8) {
    score += 0.65
  }

  const normalizedScore = Math.min(1, Math.round(score * 100) / 100)
  return normalizedScore >= 0.5 ? { id: candidate.id, score: normalizedScore } : null
}

function buildWarnings(
  receipt: Record<string, any>,
  items: Array<Record<string, any>>,
  context: {
    duplicateOf: string | null
    duplicateScore: number | null
    imageProcessing: Record<string, unknown> | null
    rawAi: Record<string, unknown>
  },
) {
  const warnings: Array<Record<string, unknown>> = []
  const requiredFields = [
    ['merchant_name', 'Merchant is missing'],
    ['invoice_no', 'Invoice No. is missing'],
    ['date', 'Date is missing'],
  ]

  for (const [field, message] of requiredFields) {
    if (!receipt[field]) {
      warnings.push({ code: 'missing_required_field', severity: 'warning', message, field })
    }
  }

  if (Number(receipt.confidence_score || 0) > 0 && Number(receipt.confidence_score || 0) < 0.65) {
    warnings.push({
      code: 'low_confidence_field',
      severity: 'warning',
      message: 'Low confidence extraction',
      field: 'confidence_score',
      details: { confidence_score: receipt.confidence_score },
    })
  }

  const itemTotal = roundMoney(items.reduce((sum, item) => sum + Number(item.line_total || 0), 0))
  const subtotal = roundMoney(Number(receipt.subtotal || 0))
  const formulaTotal = roundMoney(
    Number(receipt.subtotal || 0)
    - Number(receipt.discount || 0)
    + Number(receipt.tax || 0)
    + Number(receipt.service_charge || 0)
    + Number(receipt.rounding || 0),
  )
  const grandTotal = roundMoney(Number(receipt.grand_total || 0))

  if (items.length > 0 && subtotal > 0 && Math.abs(itemTotal - subtotal) > 0.05) {
    warnings.push({ code: 'total_mismatch', severity: 'warning', message: 'Line item total does not match subtotal', details: { item_total: itemTotal, subtotal } })
  }

  if (grandTotal > 0 && formulaTotal > 0 && Math.abs(formulaTotal - grandTotal) > 0.05) {
    warnings.push({ code: 'amount_mismatch', severity: 'warning', message: 'Calculated total does not match grand total', details: { calculated_total: formulaTotal, grand_total: grandTotal } })
  }

  const imageQuality = String(context.imageProcessing?.quality ?? context.rawAi?.parser_meta?.image_quality ?? '').toLowerCase()
  const itemQuality = String(context.rawAi?.parser_meta?.item_quality ?? '').toLowerCase()
  if (imageQuality.includes('blur') || itemQuality === 'low') {
    warnings.push({ code: 'blurry_image', severity: 'warning', message: 'Image or item OCR quality is low' })
  }

  if (context.duplicateOf) {
    warnings.push({
      code: 'possible_duplicate',
      severity: 'warning',
      message: 'Possible duplicate receipt',
      details: { duplicate_of: context.duplicateOf, duplicate_score: context.duplicateScore },
    })
  }

  return warnings
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && normalizeComparableText(left) === normalizeComparableText(right))
}

function sameDate(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && String(left).slice(0, 10) === String(right).slice(0, 10))
}

function sameAmount(left: number | null | undefined, right: number | null | undefined) {
  return Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) <= 0.05
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function similarText(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false
  const normalizedLeft = normalizeComparableText(left)
  const normalizedRight = normalizeComparableText(right)
  if (normalizedLeft.length < 4 || normalizedRight.length < 4) return false
  const distance = levenshteinDistance(normalizedLeft, normalizedRight)
  return 1 - distance / Math.max(normalizedLeft.length, normalizedRight.length) >= 0.82
}

function nearDate(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false
  const leftTime = Date.parse(String(left).slice(0, 10))
  const rightTime = Date.parse(String(right).slice(0, 10))
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false
  return Math.abs(leftTime - rightTime) <= 3 * 24 * 60 * 60 * 1000
}

function similarAmount(left: number | null | undefined, right: number | null | undefined) {
  const leftAmount = Number(left)
  const rightAmount = Number(right)
  if (!Number.isFinite(leftAmount) || !Number.isFinite(rightAmount)) return false
  const delta = Math.abs(leftAmount - rightAmount)
  return delta <= 1 || delta <= Math.max(leftAmount, rightAmount) * 0.02
}

function tokenSimilarity(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = tokenize(left)
  const rightTokens = tokenize(right)
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0

  let intersection = 0
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) intersection += 1
  })

  return Math.round((2 * intersection / (leftTokens.size + rightTokens.size)) * 100) / 100
}

function tokenize(value: string | null | undefined) {
  return new Set(
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  )
}

function readPerceptualHash(receipt: Record<string, any>) {
  const imageProcessing = receipt.image_processing
  if (!imageProcessing || typeof imageProcessing !== 'object') return null
  const hash = imageProcessing.perceptual_hash
  return typeof hash === 'string' && /^[01]{64}$/.test(hash) ? hash : null
}

function hammingDistance(left: string, right: string): number {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY
  let distance = 0
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1
  }
  return distance
}

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = Array.from({ length: right.length + 1 }, () => 0)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      )
    }
    previous.splice(0, previous.length, ...current)
  }

  return previous[right.length]
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

async function updateReceipt(client: any, receiptId: string, patch: Record<string, unknown>) {
  const { error } = await client.from('receipts').update(patch).eq('id', receiptId)
  if (error) throw error
}

function parseJsonObject(content: string): Record<string, any> {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')

  const parsed = JSON.parse(cleaned)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OpenAI response was not a JSON object')
  }
  return parsed
}

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function assertEnv(name: string) {
  if (!Deno.env.get(name)) {
    throw new Error(`Missing ${name}`)
  }
}

function normalizeLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function normalizeMoney(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function normalizeQuantity(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) / 1000 : 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encodeUtf8(value))
  return bytesToHex(new Uint8Array(digest))
}

async function hmacSha256(key: Uint8Array, value: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encodeUtf8(value))
  return new Uint8Array(signature)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
