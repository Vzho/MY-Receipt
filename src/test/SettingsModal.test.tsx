import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsModal } from '../components/SettingsModal'

describe('SettingsModal', () => {
  it('renders a notification sound toggle', () => {
    const html = renderToStaticMarkup(
      <SettingsModal
        config={{
          colorMode: 'Light',
          language: 'zh',
          currency: 'RM',
          notificationSound: false,
          uploadQueueLimit: 10,
          receiptListPageSize: 10,
          fontScale: 1.08,
          theme: { name: 'Indigo', color: 'bg-indigo-600' },
        }}
        labels={{
          systemPref: '系统偏好',
          languagePref: '语言配置',
          themeMode: '主题模式',
          lightMode: '浅色模式',
          darkMode: '深色模式',
          currencyPref: '货币设置',
          brandColor: '品牌主色调',
          notificationSoundLabel: '消息音效',
          notificationSoundDescription: '仅在关键消息时播放。',
          fontScaleLabel: '界面字号',
          fontScaleDescription: '调整页面文字、表格和按钮的显示大小。',
          fontScaleCompactLabel: '标准',
          fontScaleComfortableLabel: '较大',
          fontScaleLargeLabel: '特大',
          uploadQueueLimitLabel: '上传队列显示数量',
          uploadQueueLimitDescription: '批量上传时首页默认展示的处理任务数量。',
          receiptListPageSizeLabel: '发票列表每页数量',
          receiptListPageSizeDescription: '首页发票列表每页默认展示的记录数量。',
          fieldExtractionExportLabel: '字段提取与导出',
          fieldLabels: {
            merchant_name: '商户名称',
            invoice_no: '发票号',
          },
          showFieldLabel: '显示',
          exportFieldLabel: '导出',
          requiredFieldLabel: '必需',
          saveAndApply: '保存并应用',
        }}
        themes={[{ name: 'Indigo', color: 'bg-indigo-600' }]}
        fieldPreferences={[]}
        onConfigChange={vi.fn()}
        onFieldPreferencesChange={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(html).toContain('消息音效')
    expect(html).toContain('仅在关键消息时播放。')
    expect(html).toContain('界面字号')
    expect(html).toContain('较大')
    expect(html).toContain('特大')
    expect(html).toContain('上传队列显示数量')
    expect(html).toContain('发票列表每页数量')
    expect(html).toContain('字段提取与导出')
    expect(html).toContain('商户名称')
    expect(html).toContain('发票号')
    expect(html).toContain('显示')
    expect(html).not.toContain('Field extraction &amp; export')
    expect(html).not.toContain('Merchant')
    expect(html).toContain('settings-modal-frame')
    expect(html).toContain('settings-modal-scroll')
    expect(html).toContain('>10</button>')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('aria-pressed="true"')
  })
})
