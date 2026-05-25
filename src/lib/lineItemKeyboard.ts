export function getNextLineItemFieldIndex(currentIndex: number, itemCount: number, direction = 1): number | null {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(itemCount) || itemCount <= 0) return null
  const nextIndex = currentIndex + direction
  if (nextIndex < 0 || nextIndex >= itemCount) return null
  return nextIndex
}

export function shouldMoveLineItemFieldOnEnter(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey'>) {
  return event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey
}
