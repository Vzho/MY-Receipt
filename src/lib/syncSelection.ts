export function keepSyncedReceiptSelected<T extends { id: string; status?: string }>(
  currentReceipt: T | null | undefined,
  syncedReceipt: T,
): T | null | undefined {
  if (!currentReceipt || currentReceipt.id !== syncedReceipt.id) return currentReceipt
  return syncedReceipt
}
