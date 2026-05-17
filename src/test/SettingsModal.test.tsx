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
    expect(html).toContain('aria-pressed="false"')
  })
})
