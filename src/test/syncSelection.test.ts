import { describe, expect, it } from 'vitest'
import { keepSyncedReceiptSelected } from '../lib/syncSelection'

describe('keepSyncedReceiptSelected', () => {
  it('keeps the synced receipt selected instead of closing the review drawer', () => {
    const selected = { id: 'receipt-1', status: 'Pending', merchant_name: 'Shop' }
    const synced = { ...selected, status: 'Synced' }

    expect(keepSyncedReceiptSelected(selected, synced)).toEqual(synced)
  })

  it('does not replace a different selected receipt', () => {
    const selected = { id: 'receipt-2', status: 'Pending' }
    const synced = { id: 'receipt-1', status: 'Synced' }

    expect(keepSyncedReceiptSelected(selected, synced)).toBe(selected)
  })
})
