import { describe, expect, it } from 'vitest'
import { getAdjacentReviewReceipt, getReviewShortcutAction } from '../lib/reviewNavigation'

describe('review navigation helpers', () => {
  it('finds the next non-deleted receipt and wraps around', () => {
    const receipts = [
      { id: 'a', deleted_at: null },
      { id: 'b', deleted_at: '2026-05-25T00:00:00Z' },
      { id: 'c', deleted_at: null },
    ]

    expect(getAdjacentReviewReceipt(receipts, 'a', 1)?.id).toBe('c')
    expect(getAdjacentReviewReceipt(receipts, 'c', 1)?.id).toBe('a')
    expect(getAdjacentReviewReceipt(receipts, 'a', -1)?.id).toBe('c')
  })

  it('maps drawer shortcuts to review actions', () => {
    expect(getReviewShortcutAction({ key: 'Enter', ctrlKey: true, metaKey: false, shiftKey: false }, { drawerOpen: true, isTyping: false })).toBe('sync_next')
    expect(getReviewShortcutAction({ key: 'ArrowRight', ctrlKey: false, metaKey: false, shiftKey: false }, { drawerOpen: true, isTyping: false })).toBe('next')
    expect(getReviewShortcutAction({ key: ' ', ctrlKey: false, metaKey: false, shiftKey: false }, { drawerOpen: true, isTyping: false })).toBe('toggle_image')
    expect(getReviewShortcutAction({ key: 's', ctrlKey: false, metaKey: false, shiftKey: false }, { drawerOpen: true, isTyping: false })).toBe('save')
    expect(getReviewShortcutAction({ key: 'e', ctrlKey: false, metaKey: false, shiftKey: false }, { drawerOpen: true, isTyping: false })).toBe('export')
    expect(getReviewShortcutAction({ key: 's', ctrlKey: false, metaKey: false, shiftKey: false }, { drawerOpen: true, isTyping: true })).toBeNull()
  })
})
