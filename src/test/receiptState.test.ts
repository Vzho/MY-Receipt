import { describe, expect, it } from 'vitest'
import { applyReceiptDraftToCollection } from '../lib/receiptState'

describe('applyReceiptDraftToCollection', () => {
  it('keeps receipt tag edits visible in the matching list row', () => {
    const receipts = [
      { id: 'receipt-1', merchant_name: 'Old Merchant', tags: ['Pending'], grand_total: 12 },
      { id: 'receipt-2', merchant_name: 'Other Merchant', tags: ['Business'], grand_total: 20 },
    ]

    const updated = applyReceiptDraftToCollection(
      { id: 'receipt-1', merchant_name: 'Old Merchant', tags: ['Business', 'Tax Deductible'] },
      receipts,
    )

    expect(updated[0]).toMatchObject({
      id: 'receipt-1',
      tags: ['Business', 'Tax Deductible'],
      grand_total: 12,
    })
    expect(updated[1]).toBe(receipts[1])
  })

  it('does not rewrite a collection when the draft has no id', () => {
    const receipts = [{ id: 'receipt-1', tags: ['Pending'] }]

    expect(applyReceiptDraftToCollection({ tags: ['Business'] }, receipts)).toBe(receipts)
    expect(applyReceiptDraftToCollection(null, receipts)).toBe(receipts)
  })
})
