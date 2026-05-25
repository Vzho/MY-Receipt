import { beforeEach, describe, expect, it, vi } from 'vitest'

const pages = vi.hoisted(() => [
  { width: 800, height: 1200 },
  { width: 900, height: 1300 },
  { width: 700, height: 1000 },
])

const pdfDocument = vi.hoisted(() => ({
  numPages: pages.length,
  getPage: vi.fn((pageNumber: number) => Promise.resolve({
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: pages[pageNumber - 1].width * scale,
      height: pages[pageNumber - 1].height * scale,
    })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  })),
  destroy: vi.fn(() => Promise.resolve()),
}))

vi.mock('pdfjs-dist/build/pdf.worker.mjs?url', () => ({ default: '/pdf.worker.mjs' }))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({ promise: Promise.resolve(pdfDocument) })),
}))

describe('renderPdfPagesToReceiptImages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          fillStyle: '',
          fillRect: vi.fn(),
        })),
        toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
          callback(new Blob(['jpeg-page'], { type: 'image/jpeg' }))
        }),
      })),
    })
  })

  it('renders every PDF page as an OCR image with page metadata', async () => {
    const { renderPdfPagesToReceiptImages } = await import('../lib/pdfPreprocess')
    const file = new File(['%PDF-1.7'], 'batch.pdf', { type: 'application/pdf' })

    const rendered = await renderPdfPagesToReceiptImages(file)

    expect(rendered).toHaveLength(3)
    expect(pdfDocument.getPage).toHaveBeenCalledTimes(3)
    expect(rendered.map((page) => page.metadata.source_page)).toEqual([1, 2, 3])
    expect(rendered.map((page) => page.metadata.source_page_count)).toEqual([3, 3, 3])
    expect(rendered.map((page) => page.file.name)).toEqual([
      'batch.page-1.jpg',
      'batch.page-2.jpg',
      'batch.page-3.jpg',
    ])
  })

  it('builds stable page-level hashes from a PDF file hash', async () => {
    const { buildPdfPageFileHash } = await import('../lib/pdfPreprocess')

    expect(buildPdfPageFileHash('abc123', 1)).toBe('abc123:page:1')
    expect(buildPdfPageFileHash('abc123', 2)).toBe('abc123:page:2')
  })

  it('builds merged PDF page metadata for a single receipt review flow', async () => {
    const { buildMergedPdfPageMetadata } = await import('../lib/pdfPreprocess')

    const metadata = buildMergedPdfPageMetadata([
      {
        file: new File(['page-1'], 'page-1.jpg', { type: 'image/jpeg' }),
        metadata: {
          version: 1,
          crop_percent: { x: 0, y: 0, width: 100, height: 100 },
          rotation: 0,
          original_width: 800,
          original_height: 1200,
          output_width: 1600,
          output_height: 2200,
          source_mime_type: 'application/pdf',
          source_page: 1,
          source_page_count: 2,
        },
      },
      {
        file: new File(['page-2'], 'page-2.jpg', { type: 'image/jpeg' }),
        metadata: {
          version: 1,
          crop_percent: { x: 0, y: 0, width: 100, height: 100 },
          rotation: 0,
          original_width: 800,
          original_height: 1200,
          output_width: 1600,
          output_height: 2200,
          source_mime_type: 'application/pdf',
          source_page: 2,
          source_page_count: 2,
        },
      },
    ], 1600, 4400)

    expect(metadata).toMatchObject({
      source_mime_type: 'application/pdf',
      source_page: 1,
      source_page_count: 2,
      merged_pages: true,
      source_pages: [1, 2],
      output_width: 1600,
      output_height: 4400,
    })
  })
})
