import type { ReceiptWarning } from '../types/receipt'

const HIDDEN_WARNING_CODES = new Set<ReceiptWarning['code']>([
  'low_confidence_field',
])

const LEGACY_ITEM_QUALITY_BLURRY_MESSAGE = 'Image or item OCR quality is low'

type ReceiptWarningContext = {
  image_processing?: Record<string, unknown> | null
  raw_ai?: {
    parser_meta?: Record<string, unknown> | null
  } | null
  warnings?: ReceiptWarning[] | null
}

export function isVisibleReceiptWarning(warning: ReceiptWarning | null | undefined): warning is ReceiptWarning {
  return Boolean(warning?.code) && !HIDDEN_WARNING_CODES.has(warning.code)
}

export function filterVisibleReceiptWarnings(warnings: ReceiptWarning[] | null | undefined): ReceiptWarning[] {
  if (!Array.isArray(warnings)) return []
  return warnings.filter(isVisibleReceiptWarning)
}

export function isReceiptImageBlurQuality(value: unknown): boolean {
  return /\bblur(?:ry|red)?\b/i.test(String(value ?? ''))
}

export function hasReceiptImageBlurEvidence(receipt: ReceiptWarningContext | null | undefined): boolean {
  const imageProcessing = receipt?.image_processing ?? {}
  const parserMeta = receipt?.raw_ai?.parser_meta ?? {}
  return isReceiptImageBlurQuality(imageProcessing.quality ?? parserMeta.image_quality)
}

export function filterVisibleReceiptWarningsForReceipt(receipt: ReceiptWarningContext | null | undefined): ReceiptWarning[] {
  const visibleWarnings = filterVisibleReceiptWarnings(receipt?.warnings)
  if (hasReceiptImageBlurEvidence(receipt)) return visibleWarnings

  return visibleWarnings.filter((warning) => !(
    warning.code === 'blurry_image'
    && String(warning.message ?? '') === LEGACY_ITEM_QUALITY_BLURRY_MESSAGE
  ))
}
