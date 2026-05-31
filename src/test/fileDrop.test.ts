import { describe, expect, it } from 'vitest'
import { dragEventHasFiles, extractDroppedFiles } from '../lib/fileDrop'

describe('file drop helpers', () => {
  it('detects browser file drag events', () => {
    expect(dragEventHasFiles({ dataTransfer: { types: ['Files'] as any } })).toBe(true)
    expect(dragEventHasFiles({ dataTransfer: { types: ['text/plain'] as any } })).toBe(false)
    expect(dragEventHasFiles({ dataTransfer: null })).toBe(false)
  })

  it('extracts dropped files with a safety limit', () => {
    const first = new File(['a'], 'receipt.jpg', { type: 'image/jpeg' })
    const second = new File(['b'], 'notes.txt', { type: 'text/plain' })

    expect(extractDroppedFiles({ files: [first, second] as any }, 1)).toEqual([first])
  })
})
