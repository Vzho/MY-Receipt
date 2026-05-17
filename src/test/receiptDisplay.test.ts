import { describe, expect, it } from 'vitest'
import { formatReceiptDisplayFilename, getReceiptSourcePageLabel } from '../lib/receiptDisplay'

describe('receipt display helpers', () => {
  it('shows stable PDF page labels after receipts reload from storage metadata', () => {
    const receipt = {
      filename: 'batch.pdf',
      mime_type: 'application/pdf',
      image_processing: {
        source_mime_type: 'application/pdf',
        source_page: 2,
        source_page_count: 4,
      },
    }

    expect(getReceiptSourcePageLabel(receipt)).toBe('PDF Page 2 of 4')
    expect(formatReceiptDisplayFilename(receipt)).toBe('batch.pdf · Page 2 of 4')
  })

  it('keeps normal image receipts unchanged', () => {
    const receipt = {
      filename: 'receipt.jpg',
      mime_type: 'image/jpeg',
      image_processing: {
        source_page: 1,
      },
    }

    expect(getReceiptSourcePageLabel(receipt)).toBeNull()
    expect(formatReceiptDisplayFilename(receipt)).toBe('receipt.jpg')
  })
})
