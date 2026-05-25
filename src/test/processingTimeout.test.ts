import { describe, expect, it } from 'vitest'
import { getProcessingStageTimeoutHint } from '../lib/processingTimeout'

describe('processing timeout hints', () => {
  it('returns no hint before the stage threshold', () => {
    expect(getProcessingStageTimeoutHint('ocr_scanning', 999, { ocr_scanning: 1000 })).toBeNull()
  })

  it('returns a stage-specific hint after the threshold', () => {
    expect(getProcessingStageTimeoutHint('ai_extracting', 2000, { ai_extracting: 1500 })).toMatchObject({
      stage: 'ai_extracting',
      messageKey: 'ai_extracting_timeout',
    })
  })

  it('does not warn for completed or failed stages', () => {
    expect(getProcessingStageTimeoutHint('ready_for_review', 999_999)).toBeNull()
    expect(getProcessingStageTimeoutHint('ocr_failed', 999_999)).toBeNull()
  })
})
