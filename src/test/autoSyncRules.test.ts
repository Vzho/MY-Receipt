import { describe, expect, it } from 'vitest'
import { evaluateAutoSyncReceipt, isLowValueBatchSyncCandidate } from '../lib/autoSyncRules'
import type { Receipt } from '../types/receipt'

describe('auto sync rules', () => {
  it('auto-syncs high confidence receipts with no warnings and passing math', () => {
    const receipt = createReceipt({ confidence_score: 0.94 })

    expect(evaluateAutoSyncReceipt(receipt).shouldSync).toBe(true)
    expect(evaluateAutoSyncReceipt(receipt).ruleName).toBe('high_confidence_no_warnings_math_passed')
  })

  it('keeps receipts with warnings in manual review', () => {
    const receipt = createReceipt({
      confidence_score: 0.94,
      warnings: [{ code: 'amount_mismatch', severity: 'warning', message: 'Mismatch' }],
    })

    expect(evaluateAutoSyncReceipt(receipt).shouldSync).toBe(false)
  })

  it('detects low-value batch sync candidates', () => {
    expect(isLowValueBatchSyncCandidate(createReceipt({ grand_total: 29.9 }))).toBe(true)
    expect(isLowValueBatchSyncCandidate(createReceipt({ grand_total: 31 }))).toBe(false)
  })
})

function createReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 'receipt-1',
    user_id: 'user-1',
    filename: 'receipt.jpg',
    mime_type: 'image/jpeg',
    file_path: 'user-1/receipt-1/original.jpg',
    status: 'pending_review',
    merchant_name: 'Merchant',
    company_reg_no: null,
    address: null,
    phone: null,
    invoice_no: 'INV-1',
    date: '2026-05-25',
    time: null,
    category: 'Other',
    doc_type: 'Receipt',
    subtotal: 10,
    discount: 0,
    tax: 0,
    service_charge: 0,
    rounding: 0,
    grand_total: 10,
    payment_method: null,
    change: 0,
    subsidy_details: null,
    tags: ['Pending'],
    confidence_score: 0.9,
    error_message: null,
    processed_at: null,
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    receipt_items: [{ name: 'Item', qty: 1, unit: null, unit_price: 10, line_total: 10 }],
    ...overrides,
  }
}
