import {
  findReceiptFieldDetections,
  getReceiptOcrDetections,
  type OcrBox,
  type OcrDetection,
} from './ocrDetections'

export type ReceiptImageViewportMode = 'smart' | 'amount' | 'full'

export interface ImageSize {
  width: number
  height: number
}

export interface ReceiptImageViewportTransform {
  width: number
  height: number
  transform: string
  zoom: number
  focusBox: OcrBox | null
}

const AMOUNT_FIELD_KEYS = [
  'subtotal',
  'discount',
  'service_charge',
  'tax',
  'rounding',
  'change',
  'grand_total',
  'payment_method',
]

const AMOUNT_TEXT_PATTERN = /(\brm\b|total|subtotal|tax|sst|service|round|rounding|change|paid|payment|cash|touch|visa|master|合计|总计|小计|税|服务费|舍入|找零|付款|支付)/i

export function getReceiptImageViewportBox(
  receipt: any,
  mode: ReceiptImageViewportMode,
  focusedFieldKey?: string | null,
): OcrBox | null {
  if (mode === 'full') return null

  if (mode === 'smart' && focusedFieldKey) {
    const focusedBox = unionDetectionBoxes(findReceiptFieldDetections(receipt, focusedFieldKey))
    if (focusedBox) return focusedBox
  }

  const detections = mode === 'amount'
    ? getAmountDetections(receipt)
    : getReceiptOcrDetections(receipt)

  return unionDetectionBoxes(detections)
}

export function buildReceiptImageViewportTransform(
  naturalSize: ImageSize | null,
  frameSize: ImageSize | null,
  mode: ReceiptImageViewportMode,
  focusBox: OcrBox | null,
): ReceiptImageViewportTransform | null {
  if (!naturalSize || !frameSize || naturalSize.width <= 0 || naturalSize.height <= 0 || frameSize.width <= 0 || frameSize.height <= 0) {
    return null
  }

  const baseScale = Math.min(frameSize.width / naturalSize.width, frameSize.height / naturalSize.height)
  const baseWidth = naturalSize.width * baseScale
  const baseHeight = naturalSize.height * baseScale

  if (mode === 'full' || !focusBox) {
    return {
      width: roundPixels(baseWidth),
      height: roundPixels(baseHeight),
      transform: 'translate(0px, 0px) scale(1)',
      zoom: 1,
      focusBox: null,
    }
  }

  const paddedBox = expandBox(focusBox, naturalSize, mode === 'amount' ? 0.55 : 0.28)
  const focusWidth = Math.max(1, paddedBox.width * baseScale)
  const focusHeight = Math.max(1, paddedBox.height * baseScale)
  const maxZoom = mode === 'amount' ? 2.8 : 2.25
  const zoom = clamp(Math.min(frameSize.width / focusWidth, frameSize.height / focusHeight), 1, maxZoom)
  const focusCenterX = (paddedBox.x + paddedBox.width / 2) * baseScale
  const focusCenterY = (paddedBox.y + paddedBox.height / 2) * baseScale
  const maxDx = Math.max(0, (baseWidth * zoom - frameSize.width) / 2)
  const maxDy = Math.max(0, (baseHeight * zoom - frameSize.height) / 2)
  const dx = clamp((baseWidth / 2 - focusCenterX) * zoom, -maxDx, maxDx)
  const dy = clamp((baseHeight / 2 - focusCenterY) * zoom, -maxDy, maxDy)

  return {
    width: roundPixels(baseWidth),
    height: roundPixels(baseHeight),
    transform: `translate(${roundPixels(dx)}px, ${roundPixels(dy)}px) scale(${roundZoom(zoom)})`,
    zoom: roundZoom(zoom),
    focusBox: paddedBox,
  }
}

function getAmountDetections(receipt: any): OcrDetection[] {
  const fieldDetections = AMOUNT_FIELD_KEYS.flatMap((fieldKey) => findReceiptFieldDetections(receipt, fieldKey))
    .filter((detection) => detection.box)
  if (fieldDetections.length > 0) return fieldDetections

  return getReceiptOcrDetections(receipt)
    .filter((detection) => detection.box && AMOUNT_TEXT_PATTERN.test(detection.text))
}

function unionDetectionBoxes(detections: OcrDetection[]): OcrBox | null {
  const boxes = detections.map((detection) => detection.box).filter((box): box is OcrBox => Boolean(box))
  if (boxes.length === 0) return null

  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function expandBox(box: OcrBox, naturalSize: ImageSize, ratio: number): OcrBox {
  const padX = Math.max(24, box.width * ratio)
  const padY = Math.max(24, box.height * ratio)
  const x = clamp(box.x - padX, 0, naturalSize.width)
  const y = clamp(box.y - padY, 0, naturalSize.height)
  const right = clamp(box.x + box.width + padX, 0, naturalSize.width)
  const bottom = clamp(box.y + box.height + padY, 0, naturalSize.height)
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function roundPixels(value: number) {
  return Number(value.toFixed(2))
}

function roundZoom(value: number) {
  return Number(value.toFixed(3))
}
