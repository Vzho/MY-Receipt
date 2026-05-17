import { describe, expect, it, vi } from 'vitest'
import {
  createAppNotification,
  loadAppNotifications,
  markAppNotificationsRead,
  prependAppNotification,
  saveAppNotifications,
} from '../lib/appNotifications'

describe('app notification helpers', () => {
  it('prepends newest notifications and keeps the list capped', () => {
    const base = Array.from({ length: 100 }, (_, index) => createAppNotification(
      { type: 'info', title: `Notice ${index}` },
      new Date(`2026-05-17T00:${String(index % 60).padStart(2, '0')}:00Z`),
    ))
    const newest = createAppNotification({ type: 'success', title: 'OCR finished' }, new Date('2026-05-17T01:00:00Z'))

    const result = prependAppNotification(base, newest)

    expect(result).toHaveLength(100)
    expect(result[0]).toMatchObject({ title: 'OCR finished', type: 'success' })
  })

  it('marks unread notifications as read without changing existing read timestamps', () => {
    const unread = createAppNotification({ type: 'error', title: 'OCR failed' }, new Date('2026-05-17T01:00:00Z'))
    const alreadyRead = { ...createAppNotification({ type: 'info', title: 'Uploaded' }), read_at: '2026-05-17T01:01:00Z' }

    const result = markAppNotificationsRead([unread, alreadyRead], '2026-05-17T02:00:00Z')

    expect(result[0].read_at).toBe('2026-05-17T02:00:00Z')
    expect(result[1].read_at).toBe('2026-05-17T01:01:00Z')
  })

  it('loads and saves notifications using localStorage defensively', () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify([createAppNotification({ type: 'warning', title: 'Duplicate detected' })])),
      setItem: vi.fn(),
    } as unknown as Storage

    const loaded = loadAppNotifications('test-key', storage)
    saveAppNotifications(loaded, 'test-key', storage)

    expect(loaded).toHaveLength(1)
    expect(loaded[0].title).toBe('Duplicate detected')
    expect(storage.setItem).toHaveBeenCalledWith('test-key', expect.stringContaining('Duplicate detected'))
  })
})
