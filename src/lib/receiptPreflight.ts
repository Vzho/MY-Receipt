export type ReceiptPreflightReason = 'filename_non_receipt' | 'file_too_small' | 'image_too_small'

export interface ReceiptPreflightInput {
  name: string
  type: string
  size: number
  width?: number | null
  height?: number | null
}

export interface ReceiptPreflightResult {
  shouldConfirm: boolean
  reasons: ReceiptPreflightReason[]
}

const NON_RECEIPT_FILENAME_PATTERN = /\b(selfie|portrait|profile|avatar|face|person|people|food|meal|product|item|catalog|screenshot|wallpaper|logo)\b/i

export function getReceiptPreflightResult(input: ReceiptPreflightInput): ReceiptPreflightResult {
  if (input.type === 'application/pdf') {
    return { shouldConfirm: false, reasons: [] }
  }

  const reasons: ReceiptPreflightReason[] = []
  const filename = input.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')
  if (NON_RECEIPT_FILENAME_PATTERN.test(filename)) {
    reasons.push('filename_non_receipt')
  }

  if (Number.isFinite(input.size) && input.size > 0 && input.size < 30 * 1024) {
    reasons.push('file_too_small')
  }

  const width = Number(input.width)
  const height = Number(input.height)
  if (Number.isFinite(width) && Number.isFinite(height) && Math.min(width, height) > 0 && Math.min(width, height) < 420) {
    reasons.push('image_too_small')
  }

  return {
    shouldConfirm: reasons.length > 0,
    reasons: Array.from(new Set(reasons)),
  }
}

export async function analyzeReceiptPreflight(file: File): Promise<ReceiptPreflightResult> {
  if (!file.type.startsWith('image/')) {
    return getReceiptPreflightResult(file)
  }

  const dimensions = await readImageDimensions(file).catch(() => null)
  return getReceiptPreflightResult({
    name: file.name,
    type: file.type,
    size: file.size,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  })
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined') {
    return Promise.resolve({ width: 0, height: 0 })
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to inspect image dimensions.'))
    }
    image.src = url
  })
}
