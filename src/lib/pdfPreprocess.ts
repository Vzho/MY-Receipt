import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { ImageProcessingMetadata, ProcessedReceiptImage } from './imagePreprocess'

const MAX_PDF_OUTPUT_SIDE = 2200
const PDF_RENDER_SCALE_CAP = 2.5
const JPEG_QUALITY = 0.9

export function isPdfReceiptFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function buildPdfPageFileHash(pdfFileHash: string, pageNumber: number): string {
  return `${pdfFileHash}:page:${pageNumber}`
}

export async function renderPdfFirstPageToReceiptImage(sourceFile: File): Promise<ProcessedReceiptImage> {
  const pages = await renderPdfPagesToReceiptImages(sourceFile, { maxPages: 1 })
  if (!pages[0]) {
    throw new Error('PDF receipt has no pages.')
  }
  return pages[0]
}

export async function renderPdfPagesToReceiptImages(
  sourceFile: File,
  options: { maxPages?: number } = {},
): Promise<ProcessedReceiptImage[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const documentTask = pdfjs.getDocument({ data: new Uint8Array(await sourceFile.arrayBuffer()) })
  const pdfDocument = await documentTask.promise

  try {
    const pageCount = Number(pdfDocument.numPages || 0)
    const renderCount = Math.max(0, Math.min(pageCount, options.maxPages ?? pageCount))
    const renderedPages: ProcessedReceiptImage[] = []

    for (let pageNumber = 1; pageNumber <= renderCount; pageNumber += 1) {
      renderedPages.push(await renderPdfPageToReceiptImage(pdfDocument, sourceFile, pageNumber, pageCount))
    }

    return renderedPages
  } finally {
    await pdfDocument.destroy()
  }
}

export async function mergePdfPagesToReceiptImage(
  sourceFile: File,
  pages: ProcessedReceiptImage[],
): Promise<ProcessedReceiptImage> {
  if (pages.length === 0) {
    throw new Error('PDF receipt has no pages.')
  }
  if (pages.length === 1) return pages[0]

  const images = await Promise.all(pages.map((page) => loadImageFromFile(page.file)))
  const width = Math.max(...images.map((image) => image.naturalWidth || image.width), 1)
  const height = images.reduce((sum, image) => sum + Math.max(image.naturalHeight || image.height, 1), 0)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Browser canvas is not available.')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  let offsetY = 0
  images.forEach((image) => {
    const imageWidth = image.naturalWidth || image.width
    const imageHeight = image.naturalHeight || image.height
    const offsetX = Math.max(0, Math.floor((width - imageWidth) / 2))
    context.drawImage(image, offsetX, offsetY)
    offsetY += imageHeight
  })

  const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  const file = new File([blob], replaceExtension(sourceFile.name, 'merged-pages.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })

  return {
    file,
    metadata: buildMergedPdfPageMetadata(pages, canvas.width, canvas.height),
  }
}

export function buildMergedPdfPageMetadata(
  pages: ProcessedReceiptImage[],
  outputWidth: number,
  outputHeight: number,
): ImageProcessingMetadata & Record<string, unknown> {
  const first = pages[0]?.metadata
  return {
    version: 1,
    crop_percent: { x: 0, y: 0, width: 100, height: 100 },
    rotation: 0,
    original_width: Number(first?.original_width || outputWidth),
    original_height: Number(first?.original_height || outputHeight),
    output_width: outputWidth,
    output_height: outputHeight,
    source_mime_type: 'application/pdf',
    source_page: 1,
    source_page_count: pages.length,
    merged_pages: true,
    source_pages: pages.map((page) => page.metadata.source_page).filter(Boolean),
  }
}

async function renderPdfPageToReceiptImage(
  pdfDocument: { getPage: (pageNumber: number) => Promise<any> },
  sourceFile: File,
  pageNumber: number,
  pageCount: number,
): Promise<ProcessedReceiptImage> {
  const page = await pdfDocument.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(PDF_RENDER_SCALE_CAP, MAX_PDF_OUTPUT_SIDE / Math.max(baseViewport.width, baseViewport.height))
  const viewport = page.getViewport({ scale: Math.max(1, scale) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))

  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Browser canvas is not available.')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: context, viewport }).promise

  const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  const file = new File([blob], replaceExtension(sourceFile.name, `page-${pageNumber}.jpg`), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
  const metadata: ImageProcessingMetadata = {
    version: 1,
    crop_percent: { x: 0, y: 0, width: 100, height: 100 },
    rotation: 0,
    original_width: Math.round(baseViewport.width),
    original_height: Math.round(baseViewport.height),
    output_width: canvas.width,
    output_height: canvas.height,
    source_mime_type: 'application/pdf',
    source_page: pageNumber,
    source_page_count: pageCount,
  }

  return { file, metadata }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to render PDF receipt page.'))
      }
    }, type, quality)
  })
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load rendered PDF page.'))
    }
    image.src = url
  })
}

function replaceExtension(filename: string, extension: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return `${base}.${extension}`
}
