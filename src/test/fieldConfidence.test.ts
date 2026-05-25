import { describe, expect, it } from 'vitest'
import { getFieldConfidence, getFieldConfidenceTone, getLowConfidenceFields } from '../lib/fieldConfidence'
import type { Receipt } from '../types/receipt'

describe('field confidence helpers', () => {
  it('reads confidence from raw_ai field maps and parser metadata', () => {
    const receipt = createReceipt({
      raw_ai: {
        field_confidence: {
          merchant_name: 0.58,
          invoice_no: '0.92',
        },
        parser_meta: {
          field_confidence: {
            date: 0.71,
          },
        },
      },
    })

    expect(getFieldConfidence(receipt, 'merchant_name')).toBe(0.58)
    expect(getFieldConfidence(receipt, 'invoice_no')).toBe(0.92)
    expect(getFieldConfidence(receipt, 'date')).toBe(0.71)
    expect(getFieldConfidence(receipt, 'grand_total')).toBeNull()
  })

  it('classifies confidence tone and low confidence fields', () => {
    const receipt = createReceipt({
      raw_ai: {
        field_confidence: {
          merchant_name: 0.59,
          invoice_no: 0.74,
          date: 0.93,
        },
      },
    })

    expect(getFieldConfidenceTone(0.93)).toBe('high')
    expect(getFieldConfidenceTone(0.74)).toBe('medium')
    expect(getFieldConfidenceTone(0.59)).toBe('low')
    expect(getLowConfidenceFields(receipt)).toEqual([{ field: 'merchant_name', confidence: 0.59 }])
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
    created_at: '2026-05-25T00:00:00Z',
    updated_at: '2026-05-25T00:00:00Z',
    receipt_items: [],
    ...overrides,
  }
}
