import { normalizeReceiptItem, normalizeReceiptPatch } from './normalizeReceipt'
import { requireSupabase } from './supabaseClient'
import { computeFileSha256, scoreDuplicateCandidate } from './duplicateDetection'
import { defaultFieldPreferences, mergeFieldPreferences } from './fieldConfig'
import type { CustomDocumentType } from '../types/documentType'
import type { DuplicateCandidate } from '../types/duplicate'
import type { FieldPreference } from '../types/fieldConfig'
import type { Receipt, ReceiptFilters, ReceiptItem } from '../types/receipt'
import type { ImageProcessingMetadata } from './imagePreprocess'

export const RECEIPT_BUCKET = 'receipts'
export const MAX_RECEIPT_FILE_SIZE_BYTES = 20 * 1024 * 1024
export const ACCEPTED_RECEIPT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png']
export const ACCEPTED_RECEIPT_MIME_TYPES = [...ACCEPTED_RECEIPT_IMAGE_MIME_TYPES, 'application/pdf']

export interface UploadedReceiptResult {
  receipt: Receipt
  parseError: string | null
}

export interface CreateReceiptFromFileOptions {
  processedFile?: File | null
  imageProcessing?: (Partial<ImageProcessingMetadata> & Record<string, unknown>) | null
  fileHash?: string | null
  autoParse?: boolean
  awaitParse?: boolean
  parseMode?: ParseMode
  enabledFieldKeys?: string[]
  docType?: string | null
  qrPayload?: string | null
}

export interface PollReceiptOptions {
  intervalMs?: number
  timeoutMs?: number
  onPoll?: (receipt: Receipt) => void
}

export type ParseMode = 'ocr' | 'repair' | 'vision' | 'smart'

export interface ParseReceiptOptions {
  mode?: ParseMode
  docType?: string | null
  enabledFieldKeys?: string[]
  qrPayload?: string | null
}

export interface SoftDeleteReceiptOptions {
  reason: string
  note?: string
}

export interface FindDuplicateCandidateOptions {
  fileHash?: string | null
  receipt?: Partial<Receipt> | null
  excludeReceiptId?: string | null
}

export function validateReceiptFile(file: File): string | null {
  if (!ACCEPTED_RECEIPT_MIME_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, and PDF receipts are supported.'
  }

  if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    return 'Receipt file must be 20MB or smaller.'
  }

  return null
}

export async function createReceiptFromFile(file: File, options: CreateReceiptFromFileOptions = {}): Promise<UploadedReceiptResult> {
  const validationError = validateReceiptFile(file)
  if (validationError) {
    throw new Error(validationError)
  }

  const shouldAutoParse = options.autoParse !== false
  if (file.type === 'application/pdf' && shouldAutoParse && !options.processedFile) {
    throw new Error('PDF receipts must be converted to an OCR image before parsing.')
  }

  const client = requireSupabase()
  const user = await getCurrentUser()
  const fileHash = options.fileHash ?? await computeFileSha256(file)
  const initialDocType = options.docType === 'E-invoice' ? 'E-invoice' : 'Receipt'
  const initialExtraFields = options.qrPayload ? { qr_payload: options.qrPayload } : null

  let { data: inserted, error: insertError } = await client
    .from('receipts')
    .insert({
      user_id: user.id,
      filename: file.name,
      mime_type: file.type,
      file_hash: fileHash,
      status: 'uploaded',
      processing_stage: 'uploaded',
      category: 'Other',
      doc_type: initialDocType,
      extra_fields: initialExtraFields,
      tags: ['Pending'],
    })
    .select('*')
    .single()

  if (insertError && isMissingSchemaError(insertError)) {
    const fallback = await client
      .from('receipts')
      .insert({
        user_id: user.id,
        filename: file.name,
        mime_type: file.type,
        status: 'uploaded',
        category: 'Other',
        doc_type: 'Receipt',
        tags: ['Pending'],
      })
      .select('*')
      .single()
    inserted = fallback.data
    insertError = fallback.error
  }

  if (insertError) throw insertError

  const receipt = inserted as Receipt
  const filePath = `${user.id}/${receipt.id}/original.${getFileExtension(file)}`
  const processedFile = options.processedFile ?? null
  const processedFilePath = processedFile ? `${user.id}/${receipt.id}/processed.${getFileExtension(processedFile)}` : null

  if (processedFile) {
    const processedValidationError = validateReceiptFile(processedFile)
    if (processedValidationError) {
      await markReceiptFailed(receipt.id, processedValidationError)
      throw new Error(processedValidationError)
    }
    if (!ACCEPTED_RECEIPT_IMAGE_MIME_TYPES.includes(processedFile.type)) {
      await markReceiptFailed(receipt.id, 'OCR input must be a JPEG or PNG image.')
      throw new Error('OCR input must be a JPEG or PNG image.')
    }
  }

  const uploads = [
    client.storage.from(RECEIPT_BUCKET).upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    }),
  ]

  if (processedFile && processedFilePath) {
    uploads.push(client.storage.from(RECEIPT_BUCKET).upload(processedFilePath, processedFile, {
      contentType: processedFile.type,
      upsert: false,
    }))
  }

  const uploadResults = await Promise.all(uploads)
  const uploadError = uploadResults.find((result) => result.error)?.error
  if (uploadError) {
    await markReceiptFailed(receipt.id, uploadError.message)
    throw uploadError
  }

  let { data: updated, error: updateError } = await client
    .from('receipts')
    .update({
      file_path: filePath,
      processed_file_path: processedFilePath,
      image_processing: options.imageProcessing ?? null,
      mime_type: file.type,
      status: shouldAutoParse ? 'processing' : 'uploaded',
      processing_stage: shouldAutoParse ? 'ocr_scanning' : 'uploaded',
    })
    .eq('id', receipt.id)
    .select('*')
    .single()

  if (updateError && isMissingSchemaError(updateError)) {
    const fallback = await client
      .from('receipts')
      .update({
        file_path: filePath,
        processed_file_path: processedFilePath,
        image_processing: options.imageProcessing ?? null,
        mime_type: file.type,
        status: shouldAutoParse ? 'processing' : 'uploaded',
      })
      .eq('id', receipt.id)
      .select('*')
      .single()
    updated = fallback.data
    updateError = fallback.error
  }

  if (updateError) throw updateError

  if (!shouldAutoParse) {
    return { receipt: updated as Receipt, parseError: null }
  }

  if (options.awaitParse === false) {
    void invokeReceiptParser(receipt.id, {
      mode: options.parseMode,
      docType: options.docType,
      enabledFieldKeys: options.enabledFieldKeys,
      qrPayload: options.qrPayload,
    }).catch((error) => {
      console.error('parse-receipt async invocation failed:', error)
    })
    return { receipt: updated as Receipt, parseError: null }
  }

  const parseError = await invokeReceiptParser(receipt.id, {
    mode: options.parseMode,
    docType: options.docType,
    enabledFieldKeys: options.enabledFieldKeys,
    qrPayload: options.qrPayload,
  })
  if (parseError) return { receipt: (await getReceipt(receipt.id)) ?? (updated as Receipt), parseError }

  const refreshed = await getReceipt(receipt.id)
  return { receipt: refreshed ?? (updated as Receipt), parseError: null }
}

export async function pollReceiptUntilParsed(id: string, options: PollReceiptOptions = {}): Promise<Receipt> {
  const intervalMs = options.intervalMs ?? 1800
  const timeoutMs = options.timeoutMs ?? 90000
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    const receipt = await getReceipt(id)
    if (!receipt) throw new Error('Receipt not found while polling parse result.')
    options.onPoll?.(receipt)
    if (!isReceiptParsing(receipt)) return receipt
    await delay(intervalMs)
  }

  throw new Error(`OCR parsing is still running after ${Math.round(timeoutMs / 1000)} seconds.`)
}

export function isReceiptParsing(receipt: Pick<Receipt, 'status'>): boolean {
  return receipt.status === 'uploaded' || receipt.status === 'processing'
}

export async function listReceipts(filters: ReceiptFilters = {}): Promise<Receipt[]> {
  const client = requireSupabase()
  let query = client
    .from('receipts')
    .select('*, receipt_items(*)')
    .order('created_at', { ascending: false })

  if (!filters.includeDeleted) {
    query = query.is('deleted_at', null)
  }

  if (filters.status && filters.status !== 'All') {
    query = query.eq('status', filters.status)
  }

  if (filters.docType && filters.docType !== 'All') {
    query = query.eq('doc_type', filters.docType)
  }

  if (filters.category && filters.category !== 'All') {
    query = query.eq('category', filters.category)
  }

  if (filters.tag && filters.tag !== 'All') {
    query = query.contains('tags', [filters.tag])
  }

  if (filters.search?.trim()) {
    const value = escapeIlike(filters.search.trim())
    query = query.or(`merchant_name.ilike.%${value}%,invoice_no.ilike.%${value}%,filename.ilike.%${value}%`)
  }

  const { data, error } = await query
  if (error && !filters.includeDeleted && isMissingSchemaError(error)) {
    console.warn('v0.3 receipt columns are not available yet; loading receipts without deleted_at filtering.', error)
    return listReceipts({ ...filters, includeDeleted: true })
  }
  if (error) throw error
  return (data ?? []) as Receipt[]
}

export async function listDeletedReceipts(): Promise<Receipt[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('receipts')
    .select('*, receipt_items(*)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  if (error && isMissingSchemaError(error)) {
    console.warn('v0.3 soft-delete columns are not available yet; rejected receipts are hidden until migration runs.', error)
    return []
  }
  if (error) throw error
  return (data ?? []) as Receipt[]
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('receipts')
    .select('*, receipt_items(*)')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  return data as Receipt
}

export async function repairReceiptWithDeepSeek(id: string, options: Omit<ParseReceiptOptions, 'mode'> = {}): Promise<UploadedReceiptResult> {
  const message = await invokeReceiptParser(id, { ...options, mode: 'repair' })
  if (message) {
    const current = await getReceipt(id)
    if (!current) throw new Error(message)
    return { receipt: current, parseError: message }
  }

  const refreshed = await getReceipt(id)
  if (!refreshed) throw new Error('Receipt not found after DeepSeek text repair.')
  return { receipt: refreshed, parseError: null }
}

export async function reparseReceiptWithVision(id: string, options: Omit<ParseReceiptOptions, 'mode'> = {}): Promise<UploadedReceiptResult> {
  const message = await invokeReceiptParser(id, { ...options, mode: 'vision' })
  if (message) {
    const current = await getReceipt(id)
    if (!current) throw new Error(message)
    return { receipt: current, parseError: message }
  }

  const refreshed = await getReceipt(id)
  if (!refreshed) throw new Error('Receipt not found after Qwen vision reparse.')
  return { receipt: refreshed, parseError: null }
}

export async function smartParseReceipt(id: string, options: Omit<ParseReceiptOptions, 'mode'> = {}): Promise<UploadedReceiptResult> {
  const message = await invokeReceiptParser(id, { ...options, mode: 'smart' })
  if (message) {
    const current = await getReceipt(id)
    if (!current) throw new Error(message)
    return { receipt: current, parseError: message }
  }

  const refreshed = await getReceipt(id)
  if (!refreshed) throw new Error('Receipt not found after smart parse.')
  return { receipt: refreshed, parseError: null }
}

export async function uploadProcessedReceiptImage(
  id: string,
  processedFile: File,
  imageProcessing: ImageProcessingMetadata,
): Promise<Receipt> {
  const validationError = validateReceiptFile(processedFile)
  if (validationError) throw new Error(validationError)

  const client = requireSupabase()
  const user = await getCurrentUser()
  const processedFilePath = `${user.id}/${id}/processed-${Date.now()}.${getFileExtension(processedFile)}`

  const { error: uploadError } = await client.storage.from(RECEIPT_BUCKET).upload(processedFilePath, processedFile, {
    contentType: processedFile.type,
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data, error } = await client
    .from('receipts')
    .update({
      processed_file_path: processedFilePath,
      image_processing: imageProcessing,
      status: 'processing',
      error_message: null,
    })
    .eq('id', id)
    .select('*, receipt_items(*)')
    .single()

  if (error) throw error
  return data as Receipt
}

export async function saveReceipt(receipt: Partial<Receipt>, items: Partial<ReceiptItem>[] = []): Promise<Receipt> {
  if (!receipt.id) {
    throw new Error('Receipt id is required.')
  }

  const client = requireSupabase()
  const user = await getCurrentUser()
  const patch = normalizeReceiptPatch(receipt as Record<string, unknown>) as Record<string, any>

  let { data: updated, error: updateError } = await client
    .from('receipts')
    .update({
      merchant_name: patch.merchant_name ?? null,
      company_reg_no: patch.company_reg_no ?? null,
      address: patch.address ?? null,
      phone: patch.phone ?? null,
      invoice_no: patch.invoice_no ?? null,
      date: patch.date || null,
      time: patch.time || null,
      category: patch.category,
      doc_type: patch.doc_type,
      subtotal: patch.subtotal,
      discount: patch.discount,
      tax: patch.tax,
      service_charge: patch.service_charge,
      rounding: patch.rounding,
      grand_total: patch.grand_total,
      payment_method: patch.payment_method ?? null,
      change: patch.change,
      subsidy_details: patch.subsidy_details ?? null,
      tags: patch.tags,
      confidence_score: patch.confidence_score,
      warnings: patch.warnings ?? receipt.warnings ?? [],
      processing_stage: patch.processing_stage ?? receipt.processing_stage ?? 'ready_for_review',
      custom_doc_type: patch.custom_doc_type ?? null,
      extra_fields: patch.extra_fields ?? null,
      duplicate_of: patch.duplicate_of ?? null,
      duplicate_score: patch.duplicate_score ?? null,
      status: patch.status ?? 'pending_review',
      error_message: null,
    })
    .eq('id', receipt.id)
    .select('*')
    .single()

  if (updateError && isMissingSchemaError(updateError)) {
    const fallback = await client
      .from('receipts')
      .update({
        merchant_name: patch.merchant_name ?? null,
        company_reg_no: patch.company_reg_no ?? null,
        address: patch.address ?? null,
        phone: patch.phone ?? null,
        invoice_no: patch.invoice_no ?? null,
        date: patch.date || null,
        time: patch.time || null,
        category: patch.category,
        doc_type: patch.doc_type === 'E-invoice' ? 'Invoice' : patch.doc_type,
        subtotal: patch.subtotal,
        discount: patch.discount,
        tax: patch.tax,
        service_charge: patch.service_charge,
        rounding: patch.rounding,
        grand_total: patch.grand_total,
        payment_method: patch.payment_method ?? null,
        change: patch.change,
        subsidy_details: patch.subsidy_details ?? null,
        tags: patch.tags,
        confidence_score: patch.confidence_score,
        status: patch.status ?? 'pending_review',
        error_message: null,
      })
      .eq('id', receipt.id)
      .select('*')
      .single()
    updated = fallback.data
    updateError = fallback.error
  }

  if (updateError) throw updateError

  const { error: deleteError } = await client.from('receipt_items').delete().eq('receipt_id', receipt.id)
  if (deleteError) throw deleteError

  const normalizedItems = items
    .map((item, index) => normalizeReceiptItem(item as Record<string, unknown>, index))
    .filter((item) => item.name.length > 0)
    .map((item) => ({
      ...item,
      receipt_id: receipt.id,
      user_id: user.id,
    }))

  if (normalizedItems.length > 0) {
    const { error: itemError } = await client.from('receipt_items').insert(normalizedItems)
    if (itemError) throw itemError
  }

  return (await getReceipt(receipt.id)) ?? (updated as Receipt)
}

export async function softDeleteReceipt(id: string, options: SoftDeleteReceiptOptions): Promise<Receipt> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('receipts')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_reason: options.reason,
      deleted_note: options.note?.trim() || null,
    })
    .eq('id', id)
    .select('*, receipt_items(*)')
    .single()

  if (error && isMissingSchemaError(error)) {
    throw new Error('Soft delete requires the v0.3 Supabase migration. Run docs/ADD_RESITAI_V0_3_FIELDS.sql first.')
  }
  if (error) throw error
  return data as Receipt
}

export async function restoreReceipt(id: string): Promise<Receipt> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('receipts')
    .update({
      deleted_at: null,
      deleted_reason: null,
      deleted_note: null,
    })
    .eq('id', id)
    .select('*, receipt_items(*)')
    .single()

  if (error && isMissingSchemaError(error)) {
    throw new Error('Restore requires the v0.3 Supabase migration. Run docs/ADD_RESITAI_V0_3_FIELDS.sql first.')
  }
  if (error) throw error
  return data as Receipt
}

export async function deleteReceipt(id: string): Promise<void> {
  await softDeleteReceipt(id, { reason: 'other' })
}

export async function permanentlyDeleteReceipt(id: string): Promise<void> {
  const client = requireSupabase()
  const existing = await getReceipt(id)

  const paths = [existing?.file_path, existing?.processed_file_path].filter(Boolean) as string[]
  if (paths.length > 0) {
    const { error: storageError } = await client.storage.from(RECEIPT_BUCKET).remove(paths)
    if (storageError) throw storageError
  }

  const { error } = await client.from('receipts').delete().eq('id', id)
  if (error) throw error
}

export async function findDuplicateCandidates(options: FindDuplicateCandidateOptions): Promise<DuplicateCandidate[]> {
  const client = requireSupabase()
  const query = client
    .from('receipts')
    .select('id,user_id,filename,mime_type,file_path,file_hash,status,merchant_name,company_reg_no,address,phone,invoice_no,date,time,category,doc_type,subtotal,discount,tax,service_charge,rounding,grand_total,payment_method,change,subsidy_details,tags,confidence_score,error_message,processed_at,image_processing,raw_ocr,created_at,updated_at,deleted_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const { data, error } = await query.limit(100)
  if (error && isMissingSchemaError(error)) {
    console.warn('v0.3 duplicate columns are not available yet; duplicate detection is skipped until migration runs.', error)
    return []
  }
  if (error) throw error

  const target = buildDuplicateTarget(options)
  return ((data ?? []) as Receipt[])
    .filter((candidate) => candidate.id !== options.excludeReceiptId)
    .map((candidate) => scoreDuplicateCandidate(target, candidate))
    .filter((candidate): candidate is DuplicateCandidate => Boolean(candidate))
    .sort((left, right) => right.score - left.score)
}

export async function listCustomDocumentTypes(): Promise<CustomDocumentType[]> {
  const client = requireSupabase()
  const { data, error } = await client.from('custom_document_types').select('*').order('name', { ascending: true })
  if (error && isMissingSchemaError(error)) return []
  if (error) throw error
  return (data ?? []) as CustomDocumentType[]
}

export async function saveCustomDocumentType(name: string): Promise<CustomDocumentType> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Custom document type name is required.')

  const client = requireSupabase()
  const user = await getCurrentUser()
  const { data, error } = await client
    .from('custom_document_types')
    .upsert({ user_id: user.id, name: trimmed }, { onConflict: 'user_id,name' })
    .select('*')
    .single()

  if (error && isMissingSchemaError(error)) {
    throw new Error('Custom document types require the v0.3 Supabase migration. Run docs/ADD_RESITAI_V0_3_FIELDS.sql first.')
  }
  if (error) throw error
  return data as CustomDocumentType
}

export async function listFieldPreferences(): Promise<FieldPreference[]> {
  const client = requireSupabase()
  const { data, error } = await client.from('user_field_preferences').select('*').order('field_key', { ascending: true })
  if (error && isMissingSchemaError(error)) return defaultFieldPreferences()
  if (error) throw error
  return mergeFieldPreferences((data ?? []) as FieldPreference[])
}

export async function saveFieldPreferences(preferences: Partial<FieldPreference>[]): Promise<FieldPreference[]> {
  const client = requireSupabase()
  const user = await getCurrentUser()
  const merged = mergeFieldPreferences(preferences.length > 0 ? preferences : defaultFieldPreferences())
  const rows = merged.map((preference) => ({
    user_id: user.id,
    field_key: preference.field_key,
    enabled: preference.enabled,
    export_enabled: preference.export_enabled,
  }))

  const { data, error } = await client
    .from('user_field_preferences')
    .upsert(rows, { onConflict: 'user_id,field_key' })
    .select('*')

  if (error && isMissingSchemaError(error)) return merged
  if (error) throw error
  return mergeFieldPreferences((data ?? []) as FieldPreference[])
}

export async function createReceiptFileSignedUrl(filePath: string | null, expiresInSeconds = 60 * 60): Promise<string | null> {
  if (!filePath) return null

  const client = requireSupabase()
  const { data, error } = await client.storage.from(RECEIPT_BUCKET).createSignedUrl(filePath, expiresInSeconds)

  if (error) {
    console.error('Failed to create receipt signed URL:', error)
    return null
  }

  return data.signedUrl
}

async function invokeReceiptParser(id: string, options: ParseMode | ParseReceiptOptions = {}): Promise<string | null> {
  const client = requireSupabase()
  const normalizedOptions: ParseReceiptOptions = typeof options === 'string' ? { mode: options } : options
  const mode = normalizedOptions.mode
  const { error } = await client.functions.invoke('parse-receipt', {
    body: {
      receipt_id: id,
      ...(mode ? { mode } : {}),
      ...(normalizedOptions.docType ? { doc_type: normalizedOptions.docType } : {}),
      ...(normalizedOptions.enabledFieldKeys?.length ? { enabled_fields: normalizedOptions.enabledFieldKeys } : {}),
      ...(normalizedOptions.qrPayload ? { qr_payload: normalizedOptions.qrPayload } : {}),
    },
  })

  if (!error) return null

  const message = error.message || (mode === 'repair' ? 'DeepSeek text repair failed' : 'parse-receipt invocation failed')
  await markReceiptFailed(id, message)
  return message
}

async function markReceiptFailed(id: string, message: string): Promise<Receipt | null> {
  const client = requireSupabase()
  let { data, error } = await client
    .from('receipts')
    .update({
      status: 'failed',
      processing_stage: 'ocr_failed',
      error_message: message,
      warnings: [{
        code: 'ocr_failed',
        severity: 'error',
        message,
      }],
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error && isMissingSchemaError(error)) {
    const fallback = await client
      .from('receipts')
      .update({
        status: 'failed',
        error_message: message,
      })
      .eq('id', id)
      .select('*')
      .single()
    data = fallback.data
    error = fallback.error
  }

  if (error) {
    console.error('Failed to mark receipt as failed:', error)
    return null
  }

  return data as Receipt
}

async function getCurrentUser() {
  const client = requireSupabase()
  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error) throw error
  if (!user) throw new Error('You must sign in before uploading receipts.')
  return user
}

function getFileExtension(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension) return extension.replace(/[^a-z0-9]/g, '') || mimeToExtension(file.type)
  return mimeToExtension(file.type)
}

function mimeToExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'application/pdf') return 'pdf'
  return 'bin'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

function escapeIlike(value: string): string {
  return value.replace(/[%,]/g, '')
}

function isMissingSchemaError(error: unknown): boolean {
  const record = error as { code?: string; message?: string; details?: string; hint?: string }
  const code = record?.code ?? ''
  const text = `${record?.message ?? ''} ${record?.details ?? ''} ${record?.hint ?? ''}`
  return ['PGRST204', 'PGRST205', '42703', '42P01'].includes(code)
    || /schema cache|column|relation .* does not exist|deleted_at|file_hash|processing_stage|warnings|extra_fields|duplicate_of|custom_doc_type|custom_document_types|user_field_preferences/i.test(text)
}

function buildDuplicateTarget(options: FindDuplicateCandidateOptions): Receipt {
  const receipt = options.receipt ?? {}
  return {
    id: options.excludeReceiptId ?? 'candidate',
    user_id: receipt.user_id ?? '',
    filename: receipt.filename ?? '',
    mime_type: receipt.mime_type ?? null,
    file_path: receipt.file_path ?? null,
    file_hash: options.fileHash ?? receipt.file_hash ?? null,
    status: receipt.status ?? 'uploaded',
    merchant_name: receipt.merchant_name ?? null,
    company_reg_no: receipt.company_reg_no ?? null,
    address: receipt.address ?? null,
    phone: receipt.phone ?? null,
    invoice_no: receipt.invoice_no ?? null,
    date: receipt.date ?? null,
    time: receipt.time ?? null,
    category: receipt.category ?? 'Other',
    doc_type: receipt.doc_type ?? 'Receipt',
    subtotal: receipt.subtotal ?? 0,
    discount: receipt.discount ?? 0,
    tax: receipt.tax ?? 0,
    service_charge: receipt.service_charge ?? 0,
    rounding: receipt.rounding ?? 0,
    grand_total: receipt.grand_total ?? 0,
    payment_method: receipt.payment_method ?? null,
    change: receipt.change ?? 0,
    subsidy_details: receipt.subsidy_details ?? null,
    tags: receipt.tags ?? [],
    confidence_score: receipt.confidence_score ?? 0,
    error_message: receipt.error_message ?? null,
    processed_at: receipt.processed_at ?? null,
    image_processing: receipt.image_processing ?? null,
    raw_ocr: receipt.raw_ocr ?? null,
    created_at: receipt.created_at ?? '',
    updated_at: receipt.updated_at ?? '',
  }
}
