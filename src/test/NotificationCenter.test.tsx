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
        labels={{
          notificationCenterLabel: 'Message center',
          notificationCountLabel: (count: number) => `${count} records`,
          markAllReadLabel: 'Mark all as read',
          clearNotificationsLabel: 'Clear messages',
          noNotificationsLabel: 'No messages',
        }}
        onToggle={vi.fn()}
        onMarkAllRead={vi.fn()}
        onClear={vi.fn()}
        onOpenReceipt={vi.fn()}
      />,
    )

    expect(html).toContain('Message center')
    expect(html).toContain('OCR failed')
    expect(html).toContain('Receipt image is blurry.')
    expect(html).toContain('1 records')
    expect(html).not.toContain('消息中心')
  })
})
