import type { ReceiptCategory, ReceiptCurrency, ReceiptDocType, ReceiptTag, ReceiptTaxBreakdownEntry } from '../types/receipt'

const validCategories: ReceiptCategory[] = ['Grocery', 'Fuel', 'F&B', 'Retail', 'Service', 'Other']
const validDocTypes: ReceiptDocType[] = ['Receipt', 'Invoice', 'Credit Note', 'Expense', 'E-invoice']
const validTags: ReceiptTag[] = ['Business', 'Personal', 'Tax Deductible', 'Pending']
const validCurrencies: ReceiptCurrency[] = ['RM', 'SGD', 'USD', 'CNY']

export function normalizeMoney(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

export function normalizeReceiptPatch(input: Record<string, unknown>) {
  const category = validCategories.includes(input.category as ReceiptCategory)
    ? (input.category as ReceiptCategory)
    : 'Other'
  const doc_type = validDocTypes.includes(input.doc_type as ReceiptDocType)
    ? (input.doc_type as ReceiptDocType)
    : 'Receipt'
  const tags = Array.isArray(input.tags)
    ? input.tags.filter((tag): tag is ReceiptTag => validTags.includes(tag as ReceiptTag))
    : []
  const extraFields = input.extra_fields && typeof input.extra_fields === 'object'
    ? { ...(input.extra_fields as Record<string, unknown>) }
    : {}

  if (typeof input.tin_no === 'string' && input.tin_no.trim()) {
    extraFields.tin_no = input.tin_no.trim()
  }
  if (typeof input.sst_no === 'string' && input.sst_no.trim()) {
    extraFields.sst_no = input.sst_no.trim()
  }

  return {
    ...input,
    category,
    doc_type,
    currency: validCurrencies.includes(input.currency as ReceiptCurrency) ? input.currency : 'RM',
    custom_doc_type: typeof input.custom_doc_type === 'string' && input.custom_doc_type.trim() ? input.custom_doc_type.trim() : null,
    tags,
    subtotal: normalizeMoney(input.subtotal),
    discount: normalizeMoney(input.discount),
    tax: normalizeMoney(input.tax),
    service_charge: normalizeMoney(input.service_charge),
    rounding: normalizeMoney(input.rounding),
    grand_total: normalizeMoney(input.grand_total),
    change: normalizeMoney(input.change),
    confidence_score: Math.max(0, Math.min(1, Number(input.confidence_score) || 0)),
    tax_breakdown: normalizeTaxBreakdown(input.tax_breakdown),
    address_structured: normalizeAddressStructured(input.address_structured),
    extra_fields: Object.keys(extraFields).length > 0 ? extraFields : null,
  }
}

export function normalizeTaxBreakdown(value: unknown): ReceiptTaxBreakdownEntry[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    return {
      tax_type: String(record.tax_type ?? record.type ?? 'SST').trim() || 'SST',
      tax_rate: nullableMoney(record.tax_rate ?? record.rate),
      taxable_amount: nullableMoney(record.taxable_amount ?? record.base_amount),
      tax_amount: nullableMoney(record.tax_amount ?? record.amount),
    }
  }).filter((entry) => entry.tax_rate !== null || entry.taxable_amount !== null || entry.tax_amount !== null)
}

export function normalizeAddressStructured(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const address = {
    street: normalizeOptionalString(record.street),
    city: normalizeOptionalString(record.city),
    state: normalizeOptionalString(record.state ?? record.negeri),
    postcode: normalizeOptionalString(record.postcode ?? record.postal_code),
    country: normalizeOptionalString(record.country),
  }
  return Object.values(address).some(Boolean) ? address : null
}

export function normalizeReceiptItem(input: Record<string, unknown>, sortOrder = 0) {
  const qty = normalizeQuantity(input.qty)
  const unitPrice = normalizeMoney(input.unit_price)
  const explicitLineTotal = normalizeMoney(input.line_total)
  const lineTotal = explicitLineTotal || normalizeMoney(qty * unitPrice)

  return {
    name: String(input.name ?? input.item ?? '').trim(),
    qty,
    unit: input.unit ? String(input.unit) : null,
    unit_price: unitPrice,
    line_total: lineTotal,
    sort_order: sortOrder,
  }
}

function normalizeQuantity(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) / 1000 : 1
}

function nullableMoney(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

