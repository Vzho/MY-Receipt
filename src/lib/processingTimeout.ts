import type { ReceiptProcessingStage } from '../types/receipt'

export interface ProcessingTimeoutHint {
  stage: ReceiptProcessingStage
  thresholdMs: number
  messageKey: string
  defaultMessage: string
}

const DEFAULT_THRESHOLDS: Partial<Record<ReceiptProcessingStage, number>> = {
  ocr_scanning: 45_000,
  ai_extracting: 60_000,
  generating_preview: 30_000,
}

const DEFAULT_MESSAGES: Partial<Record<ReceiptProcessingStage, string>> = {
  ocr_scanning: 'OCR is taking longer than usual. You can keep working and retry from the receipt detail if it fails.',
  ai_extracting: 'AI extraction is taking longer than usual. The receipt remains in the queue and can be retried later.',
  generating_preview: 'Preview generation is taking longer than usual. The receipt will stay available for retry.',
}

export function getProcessingStageTimeoutHint(
  stage: ReceiptProcessingStage | null | undefined,
  elapsedMs: number,
  thresholds: Partial<Record<ReceiptProcessingStage, number>> = DEFAULT_THRESHOLDS,
): ProcessingTimeoutHint | null {
  if (!stage || stage === 'uploaded' || stage === 'ready_for_review' || stage === 'ocr_failed') return null
  const thresholdMs = thresholds[stage]
  if (!Number.isFinite(thresholdMs) || elapsedMs < Number(thresholdMs)) return null

  return {
    stage,
    thresholdMs: Number(thresholdMs),
    messageKey: `${stage}_timeout`,
    defaultMessage: DEFAULT_MESSAGES[stage] || 'Processing is taking longer than usual. You can retry from the receipt detail if it fails.',
  }
}
