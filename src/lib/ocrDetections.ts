import type { CSSProperties } from 'react'
import type { Receipt } from '../types/receipt'

export interface OcrBox {
  x: number
  y: number
  width: number
  height: number
}

export interface OcrDetection {
  text: string
  confidence?: number | null
  box?: OcrBox | null
}

export function findReceiptFieldDetections(receipt: Receipt | any, fieldKey: string): OcrDetection[] {
  const value = getReceiptFieldText(receipt, fieldKey)
  if (!value) return []
  const comparableValue = normalizeComparableText(value)
  if (comparableValue.length < 3) return []

  return getReceiptOcrDetections(receipt)
    .filter((detection) => {
      const comparableDetection = normalizeComparableText(detection.text)
      return comparableDetection.length >= 3 && (
        comparableDetection.includes(comparableValue) ||
        comparableValue.includes(comparableDetection)
      )
    })
    .slice(0, 4)
}

export function getReceiptOcrDetections(receipt: Pick<Receipt, 'raw_ai'> | any): OcrDetection[] {
  const rawAi = receipt?.raw_ai && typeof receipt.raw_ai === 'object' ? receipt.raw_ai as Record<string, unknown> : {}
  const parserMeta = rawAi.parser_meta && typeof rawAi.parser_meta === 'object' ? rawAi.parser_meta as Record<string, unknown> : {}
  const ocrMeta = rawAi.ocr_meta && typeof rawAi.ocr_meta === 'object' ? rawAi.ocr_meta as Record<string, unknown> : {}
  const sources = [rawAi.ocr_detections, ocrMeta.ocr_detections, parserMeta.ocr_detections]
  const source = sources.find(Array.isArray)
  if (!Array.isArray(source)) return []

  return source
    .map(normalizeDetection)
    .filter((detection): detection is OcrDetection => Boolean(detection?.text))
}

export function toOverlayStyle(box: OcrBox, naturalSize: { width: number; height: number }): CSSProperties {
  const width = Math.max(1, naturalSize.width)
  const height = Math.max(1, naturalSize.height)
  return {
    left: `${roundPercent((box.x / width) * 100)}%`,
    top: `${roundPercent((box.y / height) * 100)}%`,
    width: `${roundPercent((box.width / width) * 100)}%`,
    height: `${roundPercent((box.height / height) * 100)}%`,
  }
}

function normalizeDetection(value: unknown): OcrDetection | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const text = String(item.text ?? item.DetectedText ?? '').trim()
  if (!text) return null
  const box = normalizeBox(item.box)
  const confidence = Number(item.confidence ?? item.Confidence)
  return {
    text,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence > 1 ? confidence / 100 : confidence)) : null,
    box,
  }
}

function normalizeBox(value: unknown): OcrBox | null {
  if (!value || typeof value !== 'object') return null
  const box = value as Record<string, unknown>
  const x = Number(box.x)
  const y = Number(box.y)
  const width = Number(box.width)
  const height = Number(box.height)
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

function getReceiptFieldText(receipt: Receipt | any, fieldKey: string) {
  if (!receipt) return ''
  if (fieldKey === 'tax') return String(receipt.tax ?? receipt.tax_sst ?? '')
  if (fieldKey === 'items') return (receipt.items ?? receipt.receipt_items ?? []).map((item: any) => item.name).join(' ')
  const direct = receipt[fieldKey]
  if (direct !== undefined && direct !== null) return String(direct)
  const extra = receipt.extra_fields && typeof receipt.extra_fields === 'object' ? receipt.extra_fields[fieldKey] : null
  return extra === undefined || extra === null ? '' : String(extra)
}

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, '')
}

function roundPercent(value: number) {
  return Number(value.toFixed(3)).toString()
}
