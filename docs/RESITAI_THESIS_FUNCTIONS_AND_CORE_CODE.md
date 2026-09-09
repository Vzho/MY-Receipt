# ResitAI 功能与核心代码资料

本文档用于论文、proposal 或项目说明材料。内容包含系统功能、架构说明和可展示的核心代码摘录。

## 1. 系统概述

ResitAI 是一个面向会计和财务审核场景的智能票据处理系统。系统支持上传收据、发票和 E-invoice，通过 OCR 与视觉大模型辅助抽取商户、金额、税费、商品明细和发票编号等字段，并提供人工审核、异常提醒、重复检测、已删除收据库和 Excel 导出。

系统采用静态前端加 Supabase 托管后端的架构：

- 前端：React + Vite，部署在 Cloudflare Pages。
- 后端：Supabase Auth、Postgres、Storage、Edge Functions。
- OCR / AI：腾讯云 OCR、Qwen VL 视觉模型、DeepSeek 文本修复。
- 数据安全：OCR / AI 密钥只保存在 Supabase Edge Function Secrets 中，浏览器端只使用 Supabase anon key。

## 2. 主要功能

### 2.1 票据上传

系统支持：

- JPEG / PNG 图片上传。
- PDF 上传，并可按页渲染为图片用于 OCR。
- 多页 PDF 可选择按页分别识别或合并为一张票据识别。
- Ctrl + V 粘贴图片上传。
- 上传前文件类型限制，避免拖入 TXT 等非票据文件时浏览器直接打开。

核心文件：

- `src/lib/pdfPreprocess.ts`
- `src/lib/clipboardUpload.ts`
- `src/lib/receiptPreflight.ts`
- `src/components/UploadDropzone.tsx`
- `src/components/UploadQueue.tsx`

### 2.2 OCR-first 与 AI 增强

系统不是直接把所有图片都交给视觉大模型，而是采用成本可控的分层识别流程：

1. 默认先调用 OCR。
2. 使用规则从 OCR 文本中提取结构化字段。
3. 当明细为空、金额校验失败或文本质量较差时，再使用 DeepSeek 修复结构。
4. 当 OCR 文本质量很差，或用户手动点击智能解析时，再使用 Qwen VL 视觉模型。
5. 所有外部 OCR / AI 调用都通过 Supabase Edge Function 执行，前端不持有密钥。

核心文件：

- `supabase/functions/parse-receipt/index.ts`
- `supabase/functions/parse-receipt/prompt.ts`
- `src/lib/receiptApi.ts`

### 2.3 可编辑审核页

用户可以在审核页检查和修改 OCR / AI 抽取结果，包括：

- 商户名称
- 发票号
- 日期和时间
- 公司注册号
- 电话
- 付款方式
- 单据类型
- 分类标签
- 商品明细
- 折扣、税费、服务费、舍入、找零
- E-invoice 专属字段

核心文件：

- `src/components/ReceiptReviewDrawer.tsx`
- `src/components/ReceiptList.tsx`
- `src/components/ReceiptTable.tsx`
- `src/components/FieldConfigPanel.tsx`

### 2.4 金额校验

系统会根据商品明细、小计、折扣、服务费、税费、舍入和找零计算应付总额，并与票面 OCR 总额比较。如果存在差异，会生成 warning。

核心文件：

- `src/lib/receiptMath.ts`
- `src/lib/warningRules.ts`
- `src/test/receiptMath.test.ts`

### 2.5 Warning Panel

系统支持展示明确可执行的提醒，包括：

- 图片模糊
- OCR 失败
- 总额不匹配
- 金额不匹配
- 缺少必填字段
- 可能重复
- 非收据
- OCR 文本质量较差
- QR / E-invoice 字段不一致

低置信度字段提醒已从前台展示中移除，避免泛化提醒误导用户；底层置信度数据仍保留，后续可用于更精准的字段级提示。

核心文件：

- `src/lib/warningRules.ts`
- `src/lib/visibleWarnings.ts`
- `src/components/WarningPanel.tsx`
- `src/test/warningRules.test.ts`

### 2.6 Duplicate Detection

系统从两层检测重复票据：

- 文件级：计算 SHA-256 文件 hash。
- 业务级：根据发票号、商户、日期、总额、OCR 文本相似度和图片 average hash 判断是否重复。

核心文件：

- `src/lib/duplicateDetection.ts`
- `src/components/DuplicateDialog.tsx`
- `src/test/duplicateDetection.test.ts`

### 2.7 Rejected / Deleted 收据库

删除不是直接移除记录，而是软删除进入 Rejected 区域。会计可以查看删除原因，恢复记录，或永久删除数据库记录和 Storage 文件。

核心文件：

- `src/components/DeletedReceiptList.tsx`
- `src/components/DeleteReceiptDialog.tsx`
- `src/lib/receiptApi.ts`

### 2.8 字段配置与导出

用户可以选择哪些字段显示、哪些字段导出。Excel 导出使用双 Sheet：

- `Receipts`：一张发票一行。
- `Items`：一条商品明细一行。

核心文件：

- `src/lib/fieldConfig.ts`
- `src/lib/exportExcel.ts`
- `src/components/FieldConfigPanel.tsx`
- `src/test/exportExcel.test.ts`

### 2.9 E-invoice 支持

系统支持 E-invoice 类型，并保存专属字段：

- Supplier TIN
- Buyer TIN
- Invoice UUID
- Validation Link
- QR Payload
- Tax Amount
- Invoice Type

核心文件：

- `src/lib/einvoiceCompliance.ts`
- `src/lib/qrPayload.ts`
- `src/components/ReceiptReviewDrawer.tsx`
- `src/test/einvoiceCompliance.test.ts`

### 2.10 OCR / AI 用量控制

系统通过 Supabase Postgres 表和 RPC 记录每个用户每月的 OCR / AI 调用量：

- Tencent OCR
- Qwen VL
- DeepSeek Repair

该进度表示系统内部本月处理用量，不是云厂商后台的实时余额。

核心文件：

- `src/lib/ocrUsage.ts`
- `src/components/OcrQuotaProgress.tsx`
- `docs/ADD_OCR_USAGE_MONTHLY_LIMIT.sql`
- `docs/SUPABASE_SCHEMA.sql`

## 3. 核心代码摘录

以下代码为论文说明用摘录，保留关键逻辑。完整代码以项目源码文件为准。

### 3.1 OCR-first 后端处理流程

完整文件：`supabase/functions/parse-receipt/index.ts`

```ts
async function parseWithTencentOCR(client: any, receipt: any, options: ReceiptPromptOptions = {}) {
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
      `Tencent OCR monthly free quota reached (${Math.abs(Number(quota) || 0)}/${monthlyLimit}).`,
    )
  }

  const { fileBlob, mimeType, sourcePath } = await downloadReceiptImage(client, receipt)
  const base64File = await blobToBase64(fileBlob)

  if (!['image/jpeg', 'image/png'].includes(mimeType)) {
    return parseManualDraftWithNote(receipt.filename, 'Tencent OCR mode accepts JPEG and PNG receipts only.')
  }

  const ocrResult = await runTencentOCR(base64File, receipt.filename)
  const rawOcr = ocrResult.text

  await updateReceipt(client, receipt.id, { processing_stage: 'ai_extracting' })

  const aiJson = inferReceiptFromOcrText(rawOcr, receipt.filename, {
    provider: 'tencent',
    quota_units_used: quota,
    quota_monthly_limit: monthlyLimit,
    request_id: ocrResult.requestId,
    average_confidence: ocrResult.averageConfidence,
    ocr_detections: ocrResult.detections,
    image_source: sourcePath === receipt.processed_file_path ? 'processed' : 'original',
  })

  const repaired = await maybeRepairWithDeepSeek(client, receipt, rawOcr, aiJson, options)

  if (poorOcrTextScore(rawOcr) > 0.15 && Deno.env.get('DASHSCOPE_API_KEY')) {
    return parseWithVisionModel(client, receipt, options)
  }

  return { aiJson: repaired, rawOcr }
}
```

说明：

- 先使用腾讯 OCR，避免每张票据直接调用视觉大模型。
- 调用前先扣减系统内部月度配额。
- OCR 后先用规则抽取结构化字段。
- 必要时才使用 DeepSeek 或 Qwen VL 增强。

### 3.2 Qwen VL 视觉增强

完整文件：`supabase/functions/parse-receipt/index.ts`

```ts
async function parseWithVisionModel(client: any, receipt: any, options: ReceiptPromptOptions = {}) {
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
      `Qwen VL monthly reparse quota reached (${Math.abs(Number(quota) || 0)}/${monthlyLimit}).`,
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
  }

  aiJson = await maybePolishVisionWithDeepSeek(client, receipt, aiJson, options)

  return {
    aiJson,
    rawOcr: 'Parsed directly from receipt image with Qwen VL. No separate OCR text was generated.',
  }
}
```

说明：

- Qwen VL 用于视觉增强或手动智能解析。
- 与 OCR 一样受到系统内部月度额度控制。
- 视觉模型返回后可交给 DeepSeek 做结构和金额校验。

### 3.3 金额计算与校验

完整文件：`src/lib/receiptMath.ts`

```ts
export function calculateReceiptMath(input: ReceiptMathInput): ReceiptMathResult {
  const hasLineItems = input.items.length > 0

  const itemTotal = roundMoney(
    input.items.reduce((sum, item) => sum + toMoney(item.line_total), 0),
  )

  const subtotal = roundMoney(toMoney(input.subtotal))
  const discount = roundMoney(toMoney(input.discount))
  const serviceCharge = roundMoney(toMoney(input.service_charge))
  const tax = roundMoney(toMoney(input.tax))
  const rounding = roundMoney(toMoney(input.rounding))

  const baseTotal = hasLineItems ? itemTotal : subtotal

  const calculatedGrandTotal = roundMoney(
    baseTotal - discount + serviceCharge + tax + rounding,
  )

  const grandTotal = roundMoney(toMoney(input.grand_total))
  const amountDifference = roundMoney(calculatedGrandTotal - grandTotal)

  return {
    itemTotal,
    subtotal,
    calculatedGrandTotal,
    grandTotal,
    amountDifference,
    mathPassed: Math.abs(amountDifference) <= 0.05,
  }
}
```

说明：

- 有商品明细时，以明细合计作为计算基础。
- 没有商品明细时，才 fallback 使用 OCR 小计。
- 避免出现明细金额为 0，但系统仍错误判定总额通过的情况。

### 3.4 Warning 规则

完整文件：`src/lib/warningRules.ts`

```ts
export function evaluateReceiptWarnings(
  receipt: Receipt,
  items: ReceiptItem[] = receipt.receipt_items ?? [],
): ReceiptWarning[] {
  const warnings: ReceiptWarning[] = []

  if (receipt.status === 'failed' || receipt.processing_stage === 'ocr_failed') {
    warnings.push({
      code: 'ocr_failed',
      severity: 'error',
      message: receipt.error_message || 'OCR failed',
    })
  }

  const math = calculateReceiptMath({
    items,
    subtotal: receipt.subtotal,
    discount: receipt.discount,
    service_charge: receipt.service_charge,
    tax: receipt.tax,
    rounding: receipt.rounding,
    grand_total: receipt.grand_total,
  })

  if (!math.mathPassed) {
    warnings.push({
      code: 'amount_mismatch',
      severity: 'warning',
      message: 'Calculated total does not match receipt total',
      details: {
        calculated_total: math.calculatedGrandTotal,
        receipt_total: math.grandTotal,
        difference: math.amountDifference,
      },
    })
  }

  if (receipt.duplicate_of) {
    warnings.push({
      code: 'possible_duplicate',
      severity: 'warning',
      message: 'Possible duplicate receipt',
      details: { duplicate_of: receipt.duplicate_of },
    })
  }

  return warnings
}
```

说明：

- Warning Panel 只展示用户可执行的提醒。
- 低置信度字段提醒已从前台过滤，避免泛化误报。
- 金额不一致、OCR 失败、重复票据等会保留。

### 3.5 重复检测

完整文件：`src/lib/duplicateDetection.ts`

```ts
export async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function scoreDuplicateCandidate(
  receipt: Receipt,
  candidate: Receipt,
): DuplicateCandidate | null {
  let score = 0
  const reasons: string[] = []

  if (receipt.file_hash && receipt.file_hash === candidate.file_hash) {
    score += 0.7
    reasons.push('same_file_hash')
  }

  if (sameNormalized(receipt.invoice_no, candidate.invoice_no)) {
    score += 0.35
    reasons.push('same_invoice_no')
  }

  if (sameNormalized(receipt.merchant_name, candidate.merchant_name)) {
    score += 0.2
    reasons.push('same_merchant')
  }

  if (sameDate(receipt.date, candidate.date)) {
    score += 0.1
    reasons.push('same_date')
  }

  if (sameAmount(receipt.grand_total, candidate.grand_total)) {
    score += 0.2
    reasons.push('same_total')
  }

  if (score < 0.55) return null

  return {
    receipt_id: candidate.id,
    score: Math.min(1, score),
    reasons,
  }
}
```

说明：

- 文件 hash 可检测完全相同的重复上传。
- 业务字段可检测不同图片但同一张发票的重复提交。

### 3.6 PDF 按页处理

完整文件：`src/lib/pdfPreprocess.ts`

```ts
export async function renderPdfPagesToReceiptImages(
  sourceFile: File,
): Promise<ProcessedReceiptImage[]> {
  const pdfjs = await import('pdfjs-dist')
  const data = await sourceFile.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise

  const pages: ProcessedReceiptImage[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 2 })

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas context is not available')

    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({ canvasContext: context, viewport }).promise

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((output) => output ? resolve(output) : reject(new Error('PDF render failed')), 'image/jpeg', 0.92)
    })

    pages.push({
      file: new File([blob], `${sourceFile.name}-p${pageNumber}.jpg`, { type: 'image/jpeg' }),
      pageNumber,
      totalPages: pdf.numPages,
    })
  }

  return pages
}
```

说明：

- PDF 不直接送 OCR，而是先在前端渲染为图片。
- 多页 PDF 可以按页生成多张待识别图片。

### 3.7 Ctrl + V 粘贴上传

完整文件：`src/lib/clipboardUpload.ts`

```ts
export function extractReceiptImageFilesFromClipboard(
  event: Pick<ClipboardEvent, 'clipboardData'>,
): ClipboardImageExtractionResult {
  const items = Array.from(event.clipboardData?.items ?? [])
  const files: File[] = []
  const unsupportedTypes: string[] = []

  for (const item of items) {
    if (item.kind !== 'file') continue

    if (item.type === 'image/png' || item.type === 'image/jpeg') {
      const file = item.getAsFile()
      if (!file) continue

      const extension = item.type === 'image/png' ? 'png' : 'jpg'
      files.push(new File([file], `pasted-receipt-${timestamp()}.${extension}`, {
        type: item.type,
      }))
    } else if (item.type.startsWith('image/')) {
      unsupportedTypes.push(item.type)
    }
  }

  return { files, unsupportedTypes }
}
```

说明：

- 支持直接粘贴 PNG / JPEG。
- 不支持的图片格式不会进入上传队列。
- 在输入框中粘贴文字时不会触发图片上传。

### 3.8 Excel 导出

完整文件：`src/lib/exportExcel.ts`

```ts
export function flattenReceipts(
  receipts: Receipt[],
  options: DownloadReceiptsOptions = {},
): ReceiptSummaryExportRow[] {
  return receipts
    .filter((receipt) => !receipt.deleted_at)
    .map((receipt) => ({
      merchant_name: receipt.merchant_name ?? '',
      invoice_no: receipt.invoice_no ?? '',
      date: receipt.date ?? '',
      doc_type: receipt.doc_type ?? '',
      category: receipt.category ?? '',
      subtotal: toNumber(receipt.subtotal),
      discount: toNumber(receipt.discount),
      tax: toNumber(receipt.tax),
      service_charge: toNumber(receipt.service_charge),
      rounding: toNumber(receipt.rounding),
      grand_total: toNumber(receipt.grand_total),
      payment_method: receipt.payment_method ?? '',
    }))
}

export function flattenReceiptItems(
  receipts: Receipt[],
  options: DownloadReceiptsOptions = {},
): ReceiptItemExportRow[] {
  return receipts.flatMap((receipt) =>
    (receipt.receipt_items ?? []).map((item) => ({
      receipt_id: receipt.id,
      merchant_name: receipt.merchant_name ?? '',
      invoice_no: receipt.invoice_no ?? '',
      item_name: item.name,
      quantity: toNumber(item.quantity),
      unit_price: toNumber(item.unit_price),
      line_total: toNumber(item.line_total),
    })),
  )
}
```

说明：

- `Receipts` sheet 保持一张发票一行。
- `Items` sheet 保持一条商品明细一行。
- 已删除票据不会进入默认导出。

### 3.9 OCR / AI 用量统计

完整文件：`src/lib/ocrUsage.ts`

```ts
export const DEFAULT_OCR_QUOTAS = {
  tencent: { label: 'Tencent OCR', limit: 900 },
  qwen_vl: { label: 'Qwen VL', limit: 100 },
  deepseek_v4: { label: 'DeepSeek Repair', limit: 500 },
}

export function summarizeOcrUsage(
  usage: OcrUsageMonthly[],
  quotas = DEFAULT_OCR_QUOTAS,
): OcrQuotaSummary[] {
  return Object.entries(quotas).map(([provider, quota]) => {
    const providerRows = usage.filter((item) => item.provider === provider)
    const used = providerRows.reduce(
      (sum, item) => sum + Math.max(0, Math.round(Number(item.units) || 0)),
      0,
    )
    const configuredLimit = providerRows
      .map((item) => Math.round(Number(item.monthly_limit) || 0))
      .find((limit) => limit > 0)
    const limit = Math.max(1, configuredLimit || quota.limit)

    return {
      provider,
      label: quota.label,
      used,
      limit,
      percent: Math.min(100, Math.round((used / limit) * 100)),
    }
  })
}
```

说明：

- 显示系统内部本月处理用量。
- 优先使用后端实际写入的 `monthly_limit`。
- 不声称是云厂商后台实时余额。

## 4. 数据库核心结构

完整文件：`docs/SUPABASE_SCHEMA.sql`

核心表：

```sql
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  mime_type text,
  file_path text,
  processed_file_path text,
  status text not null default 'uploaded',
  processing_stage text,
  merchant_name text,
  invoice_no text,
  date text,
  category text,
  doc_type text,
  subtotal numeric,
  discount numeric,
  tax numeric,
  service_charge numeric,
  rounding numeric,
  grand_total numeric,
  warnings jsonb default '[]'::jsonb,
  extra_fields jsonb default '{}'::jsonb,
  deleted_at timestamptz,
  duplicate_of uuid,
  file_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit_price numeric,
  line_total numeric,
  sort_order integer not null default 0
);

create table if not exists public.ocr_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  provider text not null,
  units integer not null default 0,
  monthly_limit integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, period, provider)
);
```

说明：

- `receipts` 保存票据主数据。
- `receipt_items` 保存商品明细。
- `ocr_usage_monthly` 保存系统内部 OCR / AI 调用计数。
- 所有用户数据通过 RLS 按 `user_id` 隔离。

## 5. 测试覆盖

系统包含单元测试，覆盖核心业务规则：

- 金额校验：`src/test/receiptMath.test.ts`
- Warning 规则：`src/test/warningRules.test.ts`
- 重复检测：`src/test/duplicateDetection.test.ts`
- Excel 导出：`src/test/exportExcel.test.ts`
- PDF 处理：`src/test/pdfPreprocess.test.ts`
- 粘贴上传：`src/test/clipboardUpload.test.ts`
- OCR 用量统计：`src/test/ocrUsage.test.ts`

验证命令：

```bash
npm test -- --run
npm run lint
npm run build
```

## 6. 可用于论文描述的技术特点

### 6.1 成本可控

系统采用 OCR-first，而不是每张图片都直接调用视觉大模型。只有在 OCR 文本质量较差、金额校验失败或用户手动触发智能解析时，才调用更高成本的视觉模型。

### 6.2 可审核

AI 结果不是直接进入最终数据，而是进入人工审核界面。用户可以查看原图、修改字段、调整明细、处理 warning，再同步到云端或导出 Excel。

### 6.3 可追踪

系统保存处理状态、warning、删除原因、重复检测结果和 OCR / AI 调用用量，便于后续审计和优化。

### 6.4 可扩展

当前系统基于 Cloudflare Pages + Supabase 架构，不需要传统服务器。后续可以继续扩展：

- 更多 OCR provider。
- 更多视觉模型。
- 更多财务软件导出模板。
- 企业批量导入。
- Webhook 集成。
- 更完整的 E-invoice 合规校验。
