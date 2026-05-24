import { describe, expect, it } from 'vitest'
import { applyReceiptDraftToCollection, applyReceiptDraftToSelection } from '../lib/receiptState'

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

  it('keeps an open receipt detail updated while background parsing continues', () => {
    const selected = { id: 'receipt-1', status: 'Pending', merchant_name: 'Old Merchant' }

    expect(applyReceiptDraftToSelection({ id: 'receipt-1', status: 'Processing' }, selected)).toEqual({
      id: 'receipt-1',
      status: 'Processing',
      merchant_name: 'Old Merchant',
    })
  })

  it('does not reopen a receipt detail after the user closed it', () => {
    expect(applyReceiptDraftToSelection({ id: 'receipt-1', status: 'Pending' }, null)).toBeNull()
    const selected = { id: 'receipt-2', status: 'Pending' }
    expect(applyReceiptDraftToSelection({ id: 'receipt-1', status: 'Processing' }, selected)).toBe(selected)
  })
})
