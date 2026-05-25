import type { Receipt, ReceiptItem, ReceiptWarning } from '../types/receipt'
import { getLowConfidenceFields } from './fieldConfidence'
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
  addQrPayloadWarnings(warnings, receipt)
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
  const lowConfidenceFields = getLowConfidenceFields(receipt)
  for (const { field, confidence } of lowConfidenceFields) {
    warnings.push({
      code: 'low_confidence_field',
      severity: 'warning',
      message: 'Low confidence extraction',
      field,
      details: { confidence_score: confidence },
    })
  }

  if (lowConfidenceFields.length > 0) return

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

function addQrPayloadWarnings(warnings: ReceiptWarning[], receipt: Receipt) {
  const extraFields = receipt.extra_fields ?? {}
  const qrGrandTotal = numberFromUnknown(extraFields.qr_grand_total ?? extraFields.grand_total)
  const grandTotal = roundMoney(Number(receipt.grand_total || 0))

  if (qrGrandTotal > 0 && grandTotal > 0 && differs(qrGrandTotal, grandTotal)) {
    warnings.push({
      code: 'qr_amount_mismatch',
      severity: 'warning',
      message: 'QR total does not match OCR grand total',
      field: 'grand_total',
      details: {
        qr_grand_total: qrGrandTotal,
        grand_total: grandTotal,
      },
    })
  }

  const qrTaxAmount = numberFromUnknown(extraFields.qr_tax_amount ?? extraFields.tax_amount)
  const tax = roundMoney(Number(receipt.tax || 0))
  if (qrTaxAmount > 0 && tax > 0 && differs(qrTaxAmount, tax)) {
    warnings.push({
      code: 'qr_tax_mismatch',
      severity: 'warning',
      message: 'QR tax amount does not match OCR tax amount',
      field: 'tax',
      details: {
        qr_tax_amount: qrTaxAmount,
        tax,
      },
    })
  }

  addQrTextMismatch(warnings, extraFields.supplier_tin, extraFields.qr_supplier_tin, 'supplier_tin', 'qr_supplier_tin_mismatch', 'QR supplier TIN does not match OCR supplier TIN')
  addQrTextMismatch(warnings, extraFields.buyer_tin, extraFields.qr_buyer_tin, 'buyer_tin', 'qr_buyer_tin_mismatch', 'QR buyer TIN does not match OCR buyer TIN')
  addQrTextMismatch(warnings, extraFields.invoice_uuid, extraFields.qr_invoice_uuid, 'invoice_uuid', 'qr_invoice_uuid_mismatch', 'QR invoice UUID does not match OCR invoice UUID')
  addQrTextMismatch(warnings, extraFields.supplier_name, extraFields.qr_supplier_name, 'supplier_name', 'qr_supplier_mismatch', 'QR supplier does not match OCR supplier')
  addQrTextMismatch(warnings, extraFields.buyer_name, extraFields.qr_buyer_name, 'buyer_name', 'qr_buyer_mismatch', 'QR buyer does not match OCR buyer')

  const taxRate = numberFromUnknown(extraFields.tax_rate)
  const qrTaxRate = numberFromUnknown(extraFields.qr_tax_rate)
  if (taxRate > 0 && qrTaxRate > 0 && differs(taxRate, qrTaxRate)) {
    warnings.push({
      code: 'qr_tax_rate_mismatch',
      severity: 'warning',
      message: 'QR tax rate does not match OCR tax rate',
      field: 'tax_rate',
      details: { qr_tax_rate: qrTaxRate, tax_rate: taxRate },
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

  if (Number(parserMeta.poor_ocr_text_score || 0) > 0.15) {
    warnings.push({
      code: 'poor_ocr_text',
      severity: 'warning',
      message: 'OCR text quality was poor; vision fallback was used when available',
      details: { poor_ocr_text_score: parserMeta.poor_ocr_text_score },
    })
  }
}

function numberFromUnknown(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return roundMoney(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[^\d.-]/g, ''))
    return Number.isFinite(parsed) ? roundMoney(parsed) : 0
  }
  return 0
}

function addQrTextMismatch(
  warnings: ReceiptWarning[],
  ocrValue: unknown,
  qrValue: unknown,
  field: string,
  code: ReceiptWarning['code'],
  message: string,
) {
  const ocrText = normalizeQrComparableText(ocrValue)
  const qrText = normalizeQrComparableText(qrValue)
  if (!ocrText || !qrText || ocrText === qrText) return
  warnings.push({
    code,
    severity: 'warning',
    message,
    field,
    details: {
      ocr_value: String(ocrValue ?? '').trim(),
      qr_value: String(qrValue ?? '').trim(),
    },
  })
}

function normalizeQrComparableText(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g, '')
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
