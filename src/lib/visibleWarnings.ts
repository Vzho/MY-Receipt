import type { ReceiptWarning } from '../types/receipt'

const HIDDEN_WARNING_CODES = new Set<ReceiptWarning['code']>([
  'low_confidence_field',
])

export function isVisibleReceiptWarning(warning: ReceiptWarning | null | undefined): warning is ReceiptWarning {
  return Boolean(warning?.code) && !HIDDEN_WARNING_CODES.has(warning.code)
}

export function filterVisibleReceiptWarnings(warnings: ReceiptWarning[] | null | undefined): ReceiptWarning[] {
  if (!Array.isArray(warnings)) return []
  return warnings.filter(isVisibleReceiptWarning)
}
