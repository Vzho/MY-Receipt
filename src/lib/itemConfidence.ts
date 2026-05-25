import type { Receipt } from '../types/receipt'

export interface LineItemConfidence {
  index: number
  confidence: number
  reason?: string | null
}

export function getLineItemConfidence(receipt: Pick<Receipt, 'raw_ai'> | null | undefined, index: number): LineItemConfidence | null {
  const entries = getLineItemConfidenceEntries(receipt)
  return entries.find((entry) => entry.index === index) ?? null
}

export function getLineItemConfidenceEntries(receipt: Pick<Receipt, 'raw_ai'> | null | undefined): LineItemConfidence[] {
  if (!receipt?.raw_ai || typeof receipt.raw_ai !== 'object') return []
  const rawAi = receipt.raw_ai as Record<string, unknown>
  const parserMeta = rawAi.parser_meta && typeof rawAi.parser_meta === 'object'
    ? rawAi.parser_meta as Record<string, unknown>
    : {}
  const source = Array.isArray(rawAi.item_confidence)
    ? rawAi.item_confidence
    : Array.isArray(parserMeta.item_confidence)
      ? parserMeta.item_confidence
      : []

  return source
    .map((entry, fallbackIndex) => normalizeLineItemConfidence(entry, fallbackIndex))
    .filter((entry): entry is LineItemConfidence => Boolean(entry))
}

export function isLowLineItemConfidence(confidence: number | null | undefined, threshold = 0.65) {
  return typeof confidence === 'number' && Number.isFinite(confidence) && confidence > 0 && confidence < threshold
}

function normalizeLineItemConfidence(value: unknown, fallbackIndex: number): LineItemConfidence | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const index = Number(record.index ?? fallbackIndex)
  const confidence = Number(record.confidence)
  if (!Number.isInteger(index) || !Number.isFinite(confidence)) return null
  return {
    index,
    confidence: Math.max(0, Math.min(1, confidence)),
    reason: record.reason === undefined || record.reason === null ? null : String(record.reason),
  }
}
