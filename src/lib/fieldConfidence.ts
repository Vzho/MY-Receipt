import type { Receipt } from '../types/receipt'

export type FieldConfidenceTone = 'high' | 'medium' | 'low'

export function getFieldConfidence(receipt: Pick<Receipt, 'raw_ai'> | null | undefined, fieldKey: string): number | null {
  if (!receipt?.raw_ai || typeof receipt.raw_ai !== 'object') return null
  const rawAi = receipt.raw_ai as Record<string, unknown>
  const direct = readConfidenceValue(rawAi.field_confidence, fieldKey)
  if (direct !== null) return direct

  const parserMeta = rawAi.parser_meta && typeof rawAi.parser_meta === 'object'
    ? rawAi.parser_meta as Record<string, unknown>
    : null
  return readConfidenceValue(parserMeta?.field_confidence, fieldKey)
}

export function getLowConfidenceFields(receipt: Pick<Receipt, 'raw_ai'> | null | undefined, threshold = 0.65) {
  const map = getFieldConfidenceMap(receipt)
  return Object.entries(map)
    .filter(([, confidence]) => confidence > 0 && confidence < threshold)
    .map(([field, confidence]) => ({ field, confidence }))
}

export function getFieldConfidenceTone(confidence: number | null | undefined): FieldConfidenceTone | null {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null
  if (confidence < 0.65) return 'low'
  if (confidence < 0.85) return 'medium'
  return 'high'
}

export function formatFieldConfidence(confidence: number | null | undefined) {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return ''
  return `${Math.round(confidence * 100)}%`
}

function getFieldConfidenceMap(receipt: Pick<Receipt, 'raw_ai'> | null | undefined): Record<string, number> {
  if (!receipt?.raw_ai || typeof receipt.raw_ai !== 'object') return {}
  const rawAi = receipt.raw_ai as Record<string, unknown>
  const parserMeta = rawAi.parser_meta && typeof rawAi.parser_meta === 'object'
    ? rawAi.parser_meta as Record<string, unknown>
    : {}
  return {
    ...normalizeConfidenceMap(parserMeta.field_confidence),
    ...normalizeConfidenceMap(rawAi.field_confidence),
  }
}

function readConfidenceValue(source: unknown, fieldKey: string): number | null {
  const map = normalizeConfidenceMap(source)
  return Object.prototype.hasOwnProperty.call(map, fieldKey) ? map[fieldKey] : null
}

function normalizeConfidenceMap(source: unknown): Record<string, number> {
  if (!source || typeof source !== 'object') return {}
  return Object.entries(source as Record<string, unknown>).reduce<Record<string, number>>((result, [key, value]) => {
    const confidence = Number(value)
    if (Number.isFinite(confidence)) {
      result[key] = Math.max(0, Math.min(1, confidence))
    }
    return result
  }, {})
}
