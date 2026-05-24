export type ReceiptQueueFilters = {
  search: string
  status: string
  docType: string
  tag: string
  attention?: boolean
}

export type ReceiptQueueStats = {
  active: number
  attention: number
  ready: number
  processing: number
  failed: number
}

type ReceiptLike = {
  id?: string
  status?: string | null
  merchant_name?: string | null
  invoice_no?: string | null
  filename?: string | null
  display_filename?: string | null
  doc_type?: string | null
  tags?: string[] | null
  warnings?: unknown[] | null
}

export function filterReceiptQueue<T extends ReceiptLike>(receipts: T[], filters: ReceiptQueueFilters): T[] {
  return receipts.filter((receipt) => receiptMatchesQueueFilters(receipt, filters))
}

export function receiptMatchesQueueFilters(receipt: ReceiptLike, filters: ReceiptQueueFilters): boolean {
  const search = filters.search.trim().toLowerCase()
  const matchSearch = !search
    || includesSearch(receipt.merchant_name, search)
    || includesSearch(receipt.invoice_no, search)
    || includesSearch(receipt.filename, search)
    || includesSearch(receipt.display_filename, search)
  const matchStatus = filters.status === 'All' || receipt.status === filters.status
  const matchType = filters.docType === 'All' || receipt.doc_type === filters.docType
  const matchTag = filters.tag === 'All' || Boolean(receipt.tags?.includes(filters.tag))
  const matchAttention = !filters.attention || receiptNeedsAttention(receipt)

  return matchSearch && matchStatus && matchType && matchTag && matchAttention
}

export function receiptNeedsAttention(receipt: ReceiptLike): boolean {
  return receipt.status === 'Failed' || (Array.isArray(receipt.warnings) && receipt.warnings.length > 0)
}

export function summarizeReceiptQueue(receipts: ReceiptLike[]): ReceiptQueueStats {
  return receipts.reduce<ReceiptQueueStats>((stats, receipt) => {
    if (receipt.status === 'Synced') return stats
    stats.active += 1
    if (receiptNeedsAttention(receipt)) stats.attention += 1
    if (receipt.status === 'Pending') stats.ready += 1
    if (receipt.status === 'Processing') stats.processing += 1
    if (receipt.status === 'Failed') stats.failed += 1
    return stats
  }, {
    active: 0,
    attention: 0,
    ready: 0,
    processing: 0,
    failed: 0,
  })
}

export function constrainSelectionToVisible(selectedIds: string[], visibleReceipts: ReceiptLike[]): string[] {
  const visibleIds = new Set(visibleReceipts.map((receipt) => receipt.id).filter((id): id is string => Boolean(id)))
  const nextSelectedIds = selectedIds.filter((id) => visibleIds.has(id))
  return nextSelectedIds.length === selectedIds.length ? selectedIds : nextSelectedIds
}

function includesSearch(value: string | null | undefined, search: string): boolean {
  return Boolean(value?.toLowerCase().includes(search))
}
