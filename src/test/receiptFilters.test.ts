import { describe, expect, it } from 'vitest'
import {
  constrainSelectionToVisible,
  filterReceiptQueue,
  receiptNeedsAttention,
  summarizeReceiptQueue,
} from '../lib/receiptFilters'

describe('receipt queue filters', () => {
  const receipts = [
    { id: 'ready-1', status: 'Pending', merchant_name: 'Coffee Shop', invoice_no: 'INV-1', filename: 'a.jpg', doc_type: 'Receipt', tags: ['Business'], warnings: [] },
    { id: 'warn-1', status: 'Pending', merchant_name: 'Bakery', invoice_no: 'INV-2', filename: 'b.jpg', doc_type: 'Invoice', tags: ['Pending'], warnings: [{ code: 'amount_mismatch' }] },
    { id: 'processing-1', status: 'Processing', merchant_name: 'Fuel', invoice_no: 'INV-3', filename: 'c.jpg', doc_type: 'Receipt', tags: [], warnings: [] },
    { id: 'failed-1', status: 'Failed', merchant_name: 'Grocery', invoice_no: 'INV-4', filename: 'd.jpg', doc_type: 'Receipt', tags: ['Personal'], warnings: [] },
    { id: 'synced-1', status: 'Synced', merchant_name: 'Synced', invoice_no: 'INV-5', filename: 'e.jpg', doc_type: 'Receipt', tags: [], warnings: [] },
    { id: 'hidden-low-confidence', status: 'Pending', merchant_name: 'Hidden', invoice_no: 'INV-6', filename: 'f.jpg', doc_type: 'Receipt', tags: [], warnings: [{ code: 'low_confidence_field' }] },
  ]

  it('filters by attention without losing other filter dimensions', () => {
    const result = filterReceiptQueue(receipts, {
      search: '',
      status: 'All',
      docType: 'Invoice',
      tag: 'All',
      attention: true,
    })

    expect(result.map((receipt) => receipt.id)).toEqual(['warn-1'])
    expect(receiptNeedsAttention(receipts[3])).toBe(true)
    expect(receiptNeedsAttention(receipts[5])).toBe(false)
  })

  it('summarizes the active queue and excludes synced receipts', () => {
    expect(summarizeReceiptQueue(receipts)).toEqual({
      active: 5,
      attention: 2,
      ready: 3,
      processing: 1,
      failed: 1,
    })
  })

  it('removes hidden ids from bulk selection after filters change', () => {
    expect(constrainSelectionToVisible(['ready-1', 'hidden-1', 'warn-1'], [receipts[0], receipts[1]])).toEqual(['ready-1', 'warn-1'])
  })
})
