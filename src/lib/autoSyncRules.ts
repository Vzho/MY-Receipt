import { calculateReceiptMath, differs, roundMoney } from './receiptMath'
import type { Receipt, ReceiptItem } from '../types/receipt'

export interface AutoSyncDecision {
  shouldSync: boolean
  ruleName: string | null
  reason: string
}

export function evaluateAutoSyncReceipt(receipt: Receipt, items: ReceiptItem[] = receipt.receipt_items ?? []): AutoSyncDecision {
  const warnings = receipt.warnings ?? []
  const confidence = Number(receipt.confidence_score || 0)
  const grandTotal = roundMoney(Number(receipt.grand_total || 0))
  const mathPassed = receiptMathPassed(receipt, items)

  if (confidence >= 0.9 && warnings.length === 0 && mathPassed && grandTotal > 0) {
    return {
      shouldSync: true,
      ruleName: 'high_confidence_no_warnings_math_passed',
      reason: 'Confidence is high, warnings are empty, and math passed.',
    }
  }

  return {
    shouldSync: false,
    ruleName: null,
    reason: 'Manual review required.',
  }
}

export function isLowValueBatchSyncCandidate(receipt: Receipt, maxAmount = 30): boolean {
  const status = String(receipt.status || '').toLowerCase()
  const warnings = receipt.warnings ?? []
  const total = roundMoney(Number(receipt.grand_total || 0))
  return (status === 'pending_review' || status === 'pending')
    && total > 0
    && total <= maxAmount
    && warnings.length === 0
}

function receiptMathPassed(receipt: Receipt, items: ReceiptItem[]) {
  const itemTotal = roundMoney(items.reduce((sum, item) => sum + Number(item.line_total || 0), 0))
  const receiptMath = calculateReceiptMath({
    itemTotal,
    hasLineItems: items.length > 0,
    subtotal: receipt.subtotal,
    discount: receipt.discount,
    tax: receipt.tax,
    serviceCharge: receipt.service_charge,
    rounding: receipt.rounding,
    grandTotal: receipt.grand_total,
  })
  const grandTotal = roundMoney(Number(receipt.grand_total || 0))
  return grandTotal > 0 && !differs(receiptMath.calculatedTotal, grandTotal)
}
