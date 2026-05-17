import type { Receipt, ReceiptItem, ReceiptWarning } from '../types/receipt'
import { calculateReceiptMath, differs, roundMoney } from './receiptMath'

export function evaluateReceiptWarnings(receipt: Receipt, items: ReceiptItem[] = receipt.receipt_items ?? []): ReceiptWarning[] {
  const warnings: ReceiptWarning[] = []

  if (receipt.status === 'failed' || receipt.error_message) {
    warnings.push({
      code: 'ocr_failed',
      severity: 'error',
      message: receipt.error_message || 'OCR failed',
    })
  }

  addMissingFieldWarnings(warnings, receipt)
  addConfidenceWarnings(warnings, receipt)
  addAmountWarnings(warnings, receipt, items)
  addImageWarnings(warnings, receipt)

  if (receipt.duplicate_of) {
    warnings.push({
      code: 'possible_duplicate',
      severity: 'warning',
      message: 'Possible duplicate receipt',
      details: { duplicate_of: receipt.duplicate_of, duplicate_score: receipt.duplicate_score ?? null },
    })
  }

  return dedupeWarnings([...(receipt.warnings ?? []), ...warnings])
}

function addMissingFieldWarnings(warnings: ReceiptWarning[], receipt: Receipt) {
  const requiredFields: Array<[keyof Receipt, string]> = [
    ['merchant_name', 'Merchant is missing'],
    ['invoice_no', 'Invoice No. is missing'],
    ['date', 'Date is missing'],
  ]

  for (const [field, message] of requiredFields) {
    if (!receipt[field]) {
      warnings.push({ code: 'missing_required_field', severity: 'warning', message, field: String(field) })
    }
  }
}

function addConfidenceWarnings(warnings: ReceiptWarning[], receipt: Receipt) {
  if (Number(receipt.confidence_score || 0) > 0 && Number(receipt.confidence_score || 0) < 0.65) {
    warnings.push({
      code: 'low_confidence_field',
      severity: 'warning',
      message: 'Low confidence extraction',
      field: 'confidence_score',
      details: { confidence_score: receipt.confidence_score },
    })
  }
}

function addAmountWarnings(warnings: ReceiptWarning[], receipt: Receipt, items: ReceiptItem[]) {
  const itemTotal = roundMoney(items.reduce((sum, item) => sum + Number(item.line_total || 0), 0))
  const subtotal = roundMoney(Number(receipt.subtotal || 0))
  const receiptMath = calculateReceiptMath({
    itemTotal,
    subtotal,
    discount: receipt.discount,
    tax: receipt.tax,
    serviceCharge: receipt.service_charge,
    rounding: receipt.rounding,
    grandTotal: receipt.grand_total,
  })
  const formulaTotal = receiptMath.calculatedTotal
  const grandTotal = roundMoney(Number(receipt.grand_total || 0))

  if (items.length > 0 && subtotal > 0 && differs(itemTotal, subtotal)) {
    warnings.push({
      code: 'total_mismatch',
      severity: 'warning',
      message: 'Line item total does not match subtotal',
      details: { item_total: itemTotal, subtotal },
    })
  }

  if (grandTotal > 0 && formulaTotal > 0 && differs(formulaTotal, grandTotal)) {
    warnings.push({
      code: 'amount_mismatch',
      severity: 'warning',
      message: 'Calculated total does not match grand total',
      details: {
        calculated_total: formulaTotal,
        grand_total: grandTotal,
        effective_discount: receiptMath.effectiveDiscount,
        discount_already_included: receiptMath.discountAlreadyIncluded,
      },
    })
  }
}

function addImageWarnings(warnings: ReceiptWarning[], receipt: Receipt) {
  const imageProcessing = receipt.image_processing ?? {}
  const parserMeta = (receipt.raw_ai?.parser_meta ?? {}) as Record<string, unknown>
  const imageQuality = String(imageProcessing.quality ?? parserMeta.image_quality ?? '').toLowerCase()
  const itemQuality = String(parserMeta.item_quality ?? '').toLowerCase()

  if (imageQuality.includes('blur') || itemQuality === 'low') {
    warnings.push({
      code: 'blurry_image',
      severity: 'warning',
      message: 'Image or item OCR quality is low',
    })
  }
}

function dedupeWarnings(warnings: ReceiptWarning[]) {
  const seen = new Set<string>()
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.field ?? ''}:${warning.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
