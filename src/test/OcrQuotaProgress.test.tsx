import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OcrQuotaProgress } from '../components/OcrQuotaProgress'

describe('OcrQuotaProgress', () => {
  it('renders provider quota progress', () => {
    const html = renderToStaticMarkup(
      <OcrQuotaProgress
        colorMode="Light"
        labels={{
          ocrQuotaLabel: '本月处理用量',
          ocrUsageNoteLabel: '按系统内部扣减统计',
          ocrUsageCallCountLabel: (count: number) => `${count} 次调用`,
        }}
        usage={[
          { user_id: 'user-1', period: '2026-05', provider: 'tencent', units: 90, monthly_limit: 300 },
          { user_id: 'user-1', period: '2026-05', provider: 'qwen_vl', units: 20 },
        ]}
      />,
    )

    expect(html).toContain('本月处理用量')
    expect(html).toContain('按系统内部扣减统计')
    expect(html).toContain('Tencent OCR')
    expect(html).toContain('Qwen VL')
    expect(html).toContain('90/300')
    expect(html).toContain('110 次调用')
  })
})
