import { describe, expect, it } from 'vitest'
import { evaluateReceiptWarnings } from '../lib/warningRules'
import type { Receipt } from '../types/receipt'

describe('evaluateReceiptWarnings', () => {
  it('flags missing required fields and low confidence', () => {
    const warnings = evaluateReceiptWarnings(createReceipt({
      merchant_name: null,
      invoice_no: null,
      date: null,
      confidence_score: 0.4,
    }))

    expect(warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['missing_required_field', 'low_confidence_field']),
    )
  })

  it('flags total and amount mismatches', () => {
    const warnings = evaluateReceiptWarnings(
      createReceipt({
        subtotal: 12,
        tax: 1,
        grand_total: 20,
        receipt_items: [
          { name: 'A', qty: 1, unit: null, unit_price: 10, line_total: 10 },
        ],
      }),
    )

    expect(warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(['total_mismatch', 'amount_mismatch']))
  })

  it('does not subtract discount again when line totals are already discounted', () => {
    const warnings = evaluateReceiptWarnings(
      createReceipt({
        subtotal: 53.47,
        discount: 2.83,
        tax: 3.21,
        rounding: 0.02,
        grand_total: 56.7,
        receipt_items: [
          { name: 'CHICKEN FLOSSY BUN', qty: 1, unit: null, unit_price: 3.5, line_total: 3.32 },
          { name: 'BUN', qty: 1, unit: null, unit_price: 3.9, line_total: 3.7 },
          { name: 'BUN', qty: 1, unit: null, unit_price: 3.9, line_total: 3.7 },
          { name: '4.5 INCH PANDAN LONGAN CAKE', qty: 1, unit: null, unit_price: 45, line_total: 42.75 },
        ],
      }),
    )

    expect(warnings.map((warning) => warning.code)).not.toContain('amount_mismatch')
  })

  it('adds duplicate warnings when duplicate_of is present', () => {
    const warnings = evaluateReceiptWarnings(createReceipt({ duplicate_of: 'existing-receipt', duplicate_score: 0.8 }))

    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'possible_duplicate',
      details: { duplicate_of: 'existing-receipt', duplicate_score: 0.8 },
    }))
  })

  it('flags the exact field when field confidence is low', () => {
    const warnings = evaluateReceiptWarnings(createReceipt({
      raw_ai: {
        field_confidence: {
          merchant_name: 0.52,
          invoice_no: 0.91,
        },
      },
    }))

    expect(warnings).toContainEqual(expect.objectContaining({
      code: 'low_confidence_field',
      field: 'merchant_name',
      details: { confidence_score: 0.52 },
    }))
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
    date: '2026-05-16',
    time: null,
    category: 'Grocery',
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
    created_at: '2026-05-16T00:00:00Z',
    updated_at: '2026-05-16T00:00:00Z',
    receipt_items: [],
    ...overrides,
  }
}
