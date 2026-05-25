import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OcrQuotaProgress } from '../components/OcrQuotaProgress'

describe('OcrQuotaProgress', () => {
  it('renders provider quota progress', () => {
    const html = renderToStaticMarkup(
      <OcrQuotaProgress
        colorMode="Light"
        labels={{ ocrQuotaLabel: 'OCR 配额' }}
        usage={[
          { user_id: 'user-1', period: '2026-05', provider: 'tencent', units: 90 },
          { user_id: 'user-1', period: '2026-05', provider: 'qwen_vl', units: 20 },
        ]}
      />,
    )

    expect(html).toContain('OCR 配额')
    expect(html).toContain('Tencent OCR')
    expect(html).toContain('Qwen VL')
    expect(html).toContain('90/900')
  })
})
