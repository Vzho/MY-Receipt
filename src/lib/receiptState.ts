export function applyReceiptDraftToCollection<T extends { id?: string | null }>(
  draftReceipt: (Partial<T> & { id?: string | null }) | null | undefined,
  receipts: T[],
) {
  if (!draftReceipt?.id) return receipts

  return receipts.map((receipt) => (
    receipt.id === draftReceipt.id
      ? { ...receipt, ...draftReceipt } as T
      : receipt
  ))
}

export function applyReceiptDraftToSelection<T extends { id?: string | null }>(
  draftReceipt: (Partial<T> & { id?: string | null }) | null | undefined,
  selectedReceipt: T | null | undefined,
) {
  if (!draftReceipt?.id || !selectedReceipt || selectedReceipt.id !== draftReceipt.id) return selectedReceipt

  return { ...selectedReceipt, ...draftReceipt } as T
}
