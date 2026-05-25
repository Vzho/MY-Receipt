import type { Receipt } from '../types/receipt'

export const E_INVOICE_REQUIRED_FIELDS = [
  'supplier_tin',
  'buyer_tin',
  'invoice_uuid',
  'validation_link',
  'tax_amount',
] as const

export type EInvoiceRequiredField = typeof E_INVOICE_REQUIRED_FIELDS[number]

export interface EInvoiceComplianceResult {
  isEInvoice: boolean
  total: number
  filled: number
  missing: EInvoiceRequiredField[]
  canSync: boolean
  percent: number
}

export function getEInvoiceCompliance(receipt: Pick<Receipt, 'doc_type' | 'extra_fields'>): EInvoiceComplianceResult {
  const isEInvoice = receipt.doc_type === 'E-invoice'
  if (!isEInvoice) {
    return {
      isEInvoice: false,
      total: 0,
      filled: 0,
      missing: [],
      canSync: true,
      percent: 100,
    }
  }

  const extraFields = receipt.extra_fields ?? {}
  const missing = E_INVOICE_REQUIRED_FIELDS.filter((field) => !hasUsableValue(extraFields[field]))
  const total = E_INVOICE_REQUIRED_FIELDS.length
  const filled = total - missing.length

  return {
    isEInvoice: true,
    total,
    filled,
    missing,
    canSync: missing.length === 0,
    percent: Math.round((filled / total) * 100),
  }
}

export function canSyncEInvoiceReceipt(receipt: Pick<Receipt, 'doc_type' | 'extra_fields'>) {
  return getEInvoiceCompliance(receipt).canSync
}

function hasUsableValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}
