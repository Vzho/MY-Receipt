import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { ImageProcessingMetadata, ProcessedReceiptImage } from './imagePreprocess'

const MAX_PDF_OUTPUT_SIDE = 2200
const PDF_RENDER_SCALE_CAP = 2.5
const JPEG_QUALITY = 0.9

export function isPdfReceiptFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export async function renderPdfFirstPageToReceiptImage(sourceFile: File): Promise<ProcessedReceiptImage> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const documentTask = pdfjs.getDocument({ data: new Uint8Array(await sourceFile.arrayBuffer()) })
  const pdfDocument = await documentTask.promise

  try {
    const page = await pdfDocument.getPage(1)
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
    const file = new File([blob], replaceExtension(sourceFile.name, 'page-1.jpg'), {
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
      source_page: 1,
    }

    return { file, metadata }
  } finally {
    await pdfDocument.destroy()
  }
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

function replaceExtension(filename: string, extension: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return `${base}.${extension}`
}
