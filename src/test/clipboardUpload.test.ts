import { describe, expect, it } from 'vitest'
import { extractReceiptImageFilesFromClipboard } from '../lib/clipboardUpload'

describe('extractReceiptImageFilesFromClipboard', () => {
  const now = new Date('2026-05-31T08:09:10')

  it('extracts PNG clipboard images with a receipt filename', async () => {
    const result = extractReceiptImageFilesFromClipboard({
      items: [
        clipboardFileItem('image/png', new File(['png'], 'screenshot.png', { type: 'image/png' })),
      ] as any,
    }, now)

    expect(result.unsupportedImageTypes).toEqual([])
    expect(result.files).toHaveLength(1)
    expect(result.files[0].name).toBe('pasted-receipt-20260531-080910.png')
    expect(result.files[0].type).toBe('image/png')
    expect(await result.files[0].text()).toBe('png')
  })

  it('extracts JPEG clipboard images with a jpg extension', () => {
    const result = extractReceiptImageFilesFromClipboard({
      items: [
        clipboardFileItem('image/jpeg', new File(['jpeg'], 'photo.jpeg', { type: 'image/jpeg' })),
      ] as any,
    }, now)

    expect(result.unsupportedImageTypes).toEqual([])
    expect(result.files.map((file) => file.name)).toEqual(['pasted-receipt-20260531-080910.jpg'])
  })

  it('ignores non-image clipboard items', () => {
    const result = extractReceiptImageFilesFromClipboard({
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
      ] as any,
    }, now)

    expect(result.files).toEqual([])
    expect(result.unsupportedImageTypes).toEqual([])
  })

  it('reports unsupported image types without returning files', () => {
    const result = extractReceiptImageFilesFromClipboard({
      items: [
        clipboardFileItem('image/webp', new File(['webp'], 'image.webp', { type: 'image/webp' })),
      ] as any,
    }, now)

    expect(result.files).toEqual([])
    expect(result.unsupportedImageTypes).toEqual(['image/webp'])
  })

  it('keeps multiple pasted images in one batch', () => {
    const result = extractReceiptImageFilesFromClipboard({
      items: [
        clipboardFileItem('image/png', new File(['a'], 'a.png', { type: 'image/png' })),
        clipboardFileItem('image/jpeg', new File(['b'], 'b.jpg', { type: 'image/jpeg' })),
      ] as any,
    }, now)

    expect(result.files.map((file) => file.name)).toEqual([
      'pasted-receipt-20260531-080910.png',
      'pasted-receipt-20260531-080910-2.jpg',
    ])
  })
})

function clipboardFileItem(type: string, file: File) {
  return {
    kind: 'file',
    type,
    getAsFile: () => file,
  }
}
