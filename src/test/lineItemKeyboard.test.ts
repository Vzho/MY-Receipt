import { describe, expect, it } from 'vitest'
import { getNextLineItemFieldIndex, shouldMoveLineItemFieldOnEnter } from '../lib/lineItemKeyboard'

describe('line item keyboard helpers', () => {
  it('moves Enter to the next row in the same column', () => {
    expect(getNextLineItemFieldIndex(0, 3)).toBe(1)
    expect(getNextLineItemFieldIndex(1, 3)).toBe(2)
    expect(getNextLineItemFieldIndex(2, 3)).toBeNull()
  })

  it('keeps modified Enter shortcuts available for drawer actions', () => {
    expect(shouldMoveLineItemFieldOnEnter({ key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })).toBe(true)
    expect(shouldMoveLineItemFieldOnEnter({ key: 'Enter', shiftKey: false, ctrlKey: true, metaKey: false, altKey: false })).toBe(false)
    expect(shouldMoveLineItemFieldOnEnter({ key: 'e', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })).toBe(false)
  })
})
