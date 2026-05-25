import { describe, expect, it } from 'vitest'
import { parseLineItemsFromClipboard } from '../lib/lineItemPaste'

describe('parseLineItemsFromClipboard', () => {
  it('parses Excel-style tab separated line items', () => {
    expect(parseLineItemsFromClipboard('Item A\t2\t3.50\t7.00\nItem B\t1\t5.00\t5.00')).toEqual([
      { name: 'Item A', qty: 2, unit: null, unit_price: 3.5, line_total: 7 },
      { name: 'Item B', qty: 1, unit: null, unit_price: 5, line_total: 5 },
    ])
  })

  it('supports quick name plus amount rows', () => {
    expect(parseLineItemsFromClipboard('Nasi Lemak 5.00\nTea 1.50')).toEqual([
      { name: 'Nasi Lemak', qty: 1, unit: null, unit_price: 5, line_total: 5 },
      { name: 'Tea', qty: 1, unit: null, unit_price: 1.5, line_total: 1.5 },
    ])
  })
})
