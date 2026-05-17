type ReceiptDisplayInput = {
  filename?: string | null
  mime_type?: string | null
  image_processing?: {
    source_mime_type?: string | null
    source_page?: number | null
    source_page_count?: number | null
  } | null
}

export function getReceiptSourcePageLabel(receipt: ReceiptDisplayInput): string | null {
  const metadata = receipt.image_processing
  const sourcePage = Number(metadata?.source_page || 0)
  if (sourcePage <= 0) return null

  const sourceMimeType = metadata?.source_mime_type || receipt.mime_type
  if (sourceMimeType !== 'application/pdf') return null

  const pageCount = Number(metadata?.source_page_count || 0)
  return pageCount > 1 ? `PDF Page ${sourcePage} of ${pageCount}` : `PDF Page ${sourcePage}`
}

export function formatReceiptDisplayFilename(receipt: ReceiptDisplayInput): string {
  const filename = receipt.filename || ''
  const sourcePageLabel = getReceiptSourcePageLabel(receipt)
  return sourcePageLabel ? `${filename} · ${sourcePageLabel.replace(/^PDF /, '')}` : filename
}
