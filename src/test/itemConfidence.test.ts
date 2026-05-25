import { describe, expect, it } from 'vitest'
import { getLineItemConfidence, getLineItemConfidenceEntries, isLowLineItemConfidence } from '../lib/itemConfidence'

describe('line item confidence helpers', () => {
  it('reads item confidence from raw AI output', () => {
    const receipt = {
      raw_ai: {
        item_confidence: [
          { index: 0, confidence: 0.92 },
          { index: 1, confidence: 0.42, reason: 'OCR text is faint' },
        ],
      },
    }

    expect(getLineItemConfidenceEntries(receipt)).toHaveLength(2)
    expect(getLineItemConfidence(receipt, 1)).toEqual({
      index: 1,
      confidence: 0.42,
      reason: 'OCR text is faint',
    })
    expect(isLowLineItemConfidence(0.42)).toBe(true)
    expect(isLowLineItemConfidence(0.92)).toBe(false)
  })
})
