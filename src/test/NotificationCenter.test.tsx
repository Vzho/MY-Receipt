import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NotificationCenter } from '../components/NotificationCenter'

describe('NotificationCenter', () => {
  it('renders unread count and persisted messages', () => {
    const html = renderToStaticMarkup(
      <NotificationCenter
        notifications={[{
          id: 'n1',
          type: 'error',
          title: 'OCR failed',
          message: 'Receipt image is blurry.',
          receipt_id: 'receipt-1',
          created_at: '2026-05-17T10:00:00Z',
          read_at: null,
        }]}
        isOpen
        colorMode="Light"
        onToggle={vi.fn()}
        onMarkAllRead={vi.fn()}
        onClear={vi.fn()}
        onOpenReceipt={vi.fn()}
      />,
    )

    expect(html).toContain('消息中心')
    expect(html).toContain('OCR failed')
    expect(html).toContain('Receipt image is blurry.')
    expect(html).toContain('1 条记录')
  })
})
