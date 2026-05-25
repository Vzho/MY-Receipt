export type ReceiptStatus = 'uploaded' | 'processing' | 'pending_review' | 'synced' | 'failed'
export type ReceiptCategory = 'Grocery' | 'Fuel' | 'F&B' | 'Retail' | 'Service' | 'Other'
export type ReceiptDocType = 'Receipt' | 'Invoice' | 'Credit Note' | 'Expense' | 'E-invoice'
export type ReceiptTag = 'Business' | 'Personal' | 'Tax Deductible' | 'Pending'
export type ReceiptProcessingStage =
  | 'uploaded'
  | 'ocr_scanning'
  | 'ai_extracting'
  | 'generating_preview'
  | 'ready_for_review'
  | 'ocr_failed'

export interface ReceiptWarning {
  code:
    | 'total_mismatch'
    | 'amount_mismatch'
    | 'low_confidence_field'
    | 'blurry_image'
    | 'ocr_failed'
    | 'missing_required_field'
    | 'possible_duplicate'
    | 'not_receipt'
    | 'poor_ocr_text'
    | 'qr_amount_mismatch'
  severity: 'info' | 'warning' | 'error'
  message: string
  field?: string
  details?: Record<string, unknown>
}

export interface EInvoiceExtraFields {
  supplier_name?: string | null
  buyer_name?: string | null
  supplier_tin?: string | null
  buyer_tin?: string | null
  sst_no?: string | null
  invoice_uuid?: string | null
  validation_link?: string | null
  qr_payload?: string | null
  invoice_type?: string | null
  tax_amount?: number | null
  qr_grand_total?: number | null
}

export interface ReceiptItem {
  id?: string
  receipt_id?: string
  user_id?: string
  name: string
  qty: number
  unit: string | null
  unit_price: number
  line_total: number
  sort_order?: number
}

export interface Receipt {
  id: string
  user_id: string
  filename: string
  display_filename?: string
  source_page_label?: string | null
  mime_type: string | null
  file_path: string | null
  processed_file_path?: string | null
  image_processing?: Record<string, unknown> | null
  file_hash?: string | null
  status: ReceiptStatus
  processing_stage?: ReceiptProcessingStage | null
  merchant_name: string | null
  company_reg_no: string | null
  tin_no?: string | null
  sst_no?: string | null
  address: string | null
  phone: string | null
  invoice_no: string | null
  date: string | null
  time: string | null
  category: ReceiptCategory
  doc_type: ReceiptDocType
  custom_doc_type?: string | null
  subtotal: number
  discount: number
  tax: number
  service_charge: number
  rounding: number
  grand_total: number
  payment_method: string | null
  change: number
  subsidy_details: Record<string, unknown> | null
  extra_fields?: EInvoiceExtraFields & Record<string, unknown> | null
  tags: ReceiptTag[]
  confidence_score: number
  warnings?: ReceiptWarning[] | null
  duplicate_of?: string | null
  duplicate_score?: number | null
  raw_ocr?: string | null
  raw_ai?: Record<string, unknown> | null
  error_message: string | null
  processed_at: string | null
  deleted_at?: string | null
  deleted_reason?: string | null
  deleted_note?: string | null
  created_at: string
  updated_at: string
  receipt_items?: ReceiptItem[]
}

export interface ReceiptFilters {
  search?: string
  status?: ReceiptStatus | 'All'
  docType?: ReceiptDocType | 'All'
  category?: ReceiptCategory | 'All'
  tag?: ReceiptTag | 'All'
  includeDeleted?: boolean
}
