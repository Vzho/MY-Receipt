import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../components/Sidebar'

describe('Sidebar i18n', () => {
  it('renders navigation labels from language labels', () => {
    const html = renderToStaticMarkup(
      <Sidebar
        activeTab="upload"
        uploadCount={0}
        syncedCount={0}
        deletedCount={0}
        labels={{
          workflowSection: '工作流',
          workflow: '采集与校验',
          history: '云端档案',
          rejected: '已删除',
          settings: '设置',
        }}
        config={{
          colorMode: 'Light',
          theme: { color: 'bg-indigo-600' },
        }}
        onTabChange={vi.fn()}
        onSettingsOpen={vi.fn()}
      />,
    )

    expect(html).toContain('工作流')
    expect(html).toContain('已删除')
    expect(html).toContain('h-full')
    expect(html).toContain('overflow-y-auto')
    expect(html).toContain('shrink-0')
    expect(html).not.toContain('Workflow')
    expect(html).not.toContain('Rejected')
  })
})
