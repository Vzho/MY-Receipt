import { describe, expect, it } from 'vitest'
import { findReceiptFieldDetections, toOverlayStyle } from '../lib/ocrDetections'
import type { Receipt } from '../types/receipt'

describe('ocr detections', () => {
  it('matches receipt fields to OCR text detections', () => {
    const receipt = createReceipt({
      merchant_name: 'CRUMBS BAKERY DESSERT SDN. BHD.',
      raw_ai: {
        ocr_meta: {
          ocr_detections: [
            { text: 'CRUMBS BAKERY DESSERT SDN. BHD.', confidence: 0.96, box: { x: 20, y: 40, width: 260, height: 32 } },
            { text: 'TOTAL 56.70', confidence: 0.91, box: { x: 180, y: 700, width: 110, height: 28 } },
          ],
        },
      },
    })

    expect(findReceiptFieldDetections(receipt, 'merchant_name')).toEqual([
      expect.objectContaining({ text: 'CRUMBS BAKERY DESSERT SDN. BHD.' }),
    ])
  })

  it('prefers explicit field_sources from the parser when available', () => {
    const receipt = createReceipt({
      merchant_name: 'CRUMBS BAKERY',
      raw_ai: {
        field_sources: {
          merchant_name: [
            { text: 'CRUMBS', confidence: 0.88, box: { x: 10, y: 20, width: 80, height: 18 } },
          ],
        },
        ocr_meta: {
          ocr_detections: [
            { text: 'CRUMBS BAKERY', confidence: 0.96, box: { x: 20, y: 40, width: 260, height: 32 } },
          ],
        },
      },
    })

    expect(findReceiptFieldDetections(receipt, 'merchant_name')).toEqual([
      expect.objectContaining({ text: 'CRUMBS', box: { x: 10, y: 20, width: 80, height: 18 } }),
    ])
  })

  it('converts OCR boxes into percentage overlay coordinates', () => {
    expect(toOverlayStyle({ x: 20, y: 40, width: 260, height: 32 }, { width: 400, height: 800 })).toMatchObject({
      left: '5%',
      top: '5%',
      width: '65%',
      height: '4%',
    })
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
