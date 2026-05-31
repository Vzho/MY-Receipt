import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProcessingPanel } from '../components/ProcessingPanel'
import { WarningPanel } from '../components/WarningPanel'

describe('processing and warning panel i18n', () => {
  it('renders processing stages from labels', () => {
    const html = renderToStaticMarkup(
      <ProcessingPanel
        stage="ready_for_review"
        status="Pending"
        labels={{
          processingStageLabels: {
            uploaded: '已上传',
            ocr_scanning: 'OCR 识别中',
            ai_extracting: 'AI 抽取字段中',
            generating_preview: '生成预览中',
            ready_for_review: '待审核',
            ocr_failed: 'OCR 失败',
          },
          optionLabels: {
            Pending: '待核对',
          },
        }}
      />,
    )

    expect(html).toContain('待审核')
    expect(html).toContain('待核对')
    expect(html).not.toContain('Ready for review')
  })

  it('keeps compact processing width independent from receipt name length', () => {
    const html = renderToStaticMarkup(
      <ProcessingPanel
        compact
        stage="ocr_scanning"
        status="Processing"
        labels={{
          processingStageLabels: {
            uploaded: '已上传',
            ocr_scanning: 'OCR 识别中',
            ai_extracting: 'AI 抽取字段中',
            generating_preview: '生成预览中',
            ready_for_review: '待审核',
            ocr_failed: 'OCR 失败',
          },
        }}
      />,
    )

    expect(html).toContain('w-72')
    expect(html).toContain('OCR 识别中')
    expect(html).toContain('width:40%')
  })

  it('renders warning labels and messages from labels', () => {
    const html = renderToStaticMarkup(
      <WarningPanel
        warnings={[{
          code: 'amount_mismatch',
          severity: 'warning',
          message: 'Calculated total does not match grand total',
        }]}
        labels={{
          warningCountLabel: (count: number) => `${count} 个提醒`,
          warningLabels: {
            amount_mismatch: '金额不匹配',
          },
          warningMessages: {
            'Calculated total does not match grand total': '计算总额与票面总额不一致',
          },
        }}
      />,
    )

    expect(html).toContain('1 个提醒')
    expect(html).toContain('金额不匹配')
    expect(html).toContain('计算总额与票面总额不一致')
    expect(html).not.toContain('Amount mismatch')
  })

  it('hides legacy low confidence warnings from the main warning panel', () => {
    const html = renderToStaticMarkup(
      <WarningPanel
        warnings={[
          {
            code: 'low_confidence_field',
            severity: 'warning',
            message: 'Low confidence extraction',
            field: 'merchant_name',
          },
          {
            code: 'blurry_image',
            severity: 'warning',
            message: 'Image or item OCR quality is low',
          },
        ]}
        labels={{
          warningCountLabel: (count: number) => `${count} 个提醒`,
          warningLabels: {
            low_confidence_field: '低置信度字段',
            blurry_image: '图片模糊',
          },
        }}
      />,
    )

    expect(html).toContain('1 个提醒')
    expect(html).toContain('图片模糊')
    expect(html).not.toContain('低置信度字段')
    expect(html).not.toContain('Low confidence extraction')
  })
})
