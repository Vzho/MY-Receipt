import { describe, expect, it } from 'vitest'
import { currentOcrUsagePeriod, summarizeOcrUsage } from '../lib/ocrUsage'

describe('ocr usage helpers', () => {
  it('summarizes usage against provider limits', () => {
    const rows = summarizeOcrUsage([
      { user_id: 'user-1', period: '2026-05', provider: 'tencent', units: 90 },
      { user_id: 'user-1', period: '2026-05', provider: 'qwen_vl', units: 25 },
      { user_id: 'user-1', period: '2026-05', provider: 'openai_vision', units: 30 },
    ])

    expect(rows.find((row) => row.provider === 'tencent')).toMatchObject({ used: 90, limit: 900, percent: 10 })
    expect(rows.find((row) => row.provider === 'qwen_vl')).toMatchObject({ used: 25, limit: 100, percent: 25 })
    expect(rows.find((row) => row.provider === 'openai_vision')).toMatchObject({ used: 30, limit: 300, percent: 10 })
  })

  it('uses persisted backend monthly limits when available', () => {
    const rows = summarizeOcrUsage([
      { user_id: 'user-1', period: '2026-05', provider: 'tencent', units: 90, monthly_limit: 300 },
    ])

    expect(rows.find((row) => row.provider === 'tencent')).toMatchObject({ used: 90, limit: 300, percent: 30 })
  })

  it('formats the current quota period', () => {
    expect(currentOcrUsagePeriod(new Date('2026-05-25T00:00:00Z'))).toBe('2026-05')
  })
})
