export interface CropPercent {
  x: number
  y: number
  width: number
  height: number
}

export interface ImageProcessingMetadata {
  version: 1
  crop_percent: CropPercent
  rotation: 0 | 90 | 180 | 270
  original_width: number
  original_height: number
  output_width: number
  output_height: number
  perceptual_hash?: string
  source_mime_type?: string
  source_page?: number
  source_page_count?: number
}

export interface ProcessedReceiptImage {
  file: File
  metadata: ImageProcessingMetadata
}

const MAX_OUTPUT_SIDE = 2200
const JPEG_QUALITY = 0.9

export async function renderProcessedReceiptImage(
  sourceFile: File,
  cropPercent: CropPercent,
  rotation: 0 | 90 | 180 | 270,
): Promise<ProcessedReceiptImage> {
  const image = await loadImage(sourceFile)
  const sourceCrop = percentToPixels(cropPercent, image.naturalWidth, image.naturalHeight)
  const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(sourceCrop.width, sourceCrop.height))
  const outputWidth = Math.max(1, Math.round(sourceCrop.width * scale))
  const outputHeight = Math.max(1, Math.round(sourceCrop.height * scale))
  const rotated = rotation === 90 || rotation === 270

  const canvas = document.createElement('canvas')
  canvas.width = rotated ? outputHeight : outputWidth
  canvas.height = rotated ? outputWidth : outputHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Browser canvas is not available.')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  if (rotation === 90) {
    context.translate(canvas.width, 0)
    context.rotate(Math.PI / 2)
  } else if (rotation === 180) {
    context.translate(canvas.width, canvas.height)
    context.rotate(Math.PI)
  } else if (rotation === 270) {
    context.translate(0, canvas.height)
    context.rotate(-Math.PI / 2)
  }

  context.drawImage(
    image,
    sourceCrop.x,
    sourceCrop.y,
    sourceCrop.width,
    sourceCrop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  )

  const blob = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  const file = new File([blob], replaceExtension(sourceFile.name, 'processed.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })

  return {
    file,
    metadata: {
      version: 1,
      crop_percent: cropPercent,
      rotation,
      original_width: image.naturalWidth,
      original_height: image.naturalHeight,
      output_width: canvas.width,
      output_height: canvas.height,
    },
  }
}

export function defaultReceiptCrop(): CropPercent {
  return { x: 8, y: 5, width: 84, height: 90 }
}

export function clampCrop(crop: CropPercent): CropPercent {
  const width = clamp(crop.width, 18, 100)
  const height = clamp(crop.height, 18, 100)
  const x = clamp(crop.x, 0, 100 - width)
  const y = clamp(crop.y, 0, 100 - height)
  return { x, y, width, height }
}

function percentToPixels(crop: CropPercent, naturalWidth: number, naturalHeight: number) {
  const clamped = clampCrop(crop)
  return {
    x: Math.round((clamped.x / 100) * naturalWidth),
    y: Math.round((clamped.y / 100) * naturalHeight),
    width: Math.max(1, Math.round((clamped.width / 100) * naturalWidth)),
    height: Math.max(1, Math.round((clamped.height / 100) * naturalHeight)),
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load receipt image.'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to export processed receipt image.'))
      }
    }, type, quality)
  })
}

function replaceExtension(filename: string, extension: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return `${base}.${extension}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
