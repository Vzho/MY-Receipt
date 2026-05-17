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
