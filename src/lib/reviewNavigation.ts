export type ReviewShortcutAction =
  | 'sync_next'
  | 'next'
  | 'previous'
  | 'toggle_image'
  | 'save'
  | 'export'
  | null

interface ReviewShortcutEvent {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

interface ReviewShortcutContext {
  drawerOpen: boolean
  isTyping: boolean
}

export function getAdjacentReviewReceipt<T extends { id: string; deleted_at?: string | null }>(
  receipts: T[],
  currentId: string | null | undefined,
  direction: 1 | -1,
) {
  const candidates = receipts.filter((receipt) => !receipt.deleted_at)
  if (candidates.length === 0) return null
  if (!currentId) return candidates[0]
  const currentIndex = candidates.findIndex((receipt) => receipt.id === currentId)
  if (currentIndex < 0) return candidates[0]
  const nextIndex = (currentIndex + direction + candidates.length) % candidates.length
  return candidates[nextIndex]
}

export function getReviewShortcutAction(event: ReviewShortcutEvent, context: ReviewShortcutContext): ReviewShortcutAction {
  if (!context.drawerOpen) return null
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const withCommand = Boolean(event.ctrlKey || event.metaKey)

  if (withCommand && key === 'Enter') return 'sync_next'
  if (context.isTyping) return null
  if (key === 'ArrowRight') return 'next'
  if (key === 'ArrowLeft') return 'previous'
  if (key === ' ') return 'toggle_image'
  if (key === 's') return 'save'
  if (key === 'e') return 'export'
  return null
}
