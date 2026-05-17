import { describe, expect, it } from 'vitest'
import { shouldPlayNotificationSound, shouldPreviewNotificationSoundOnToggle } from '../lib/notificationSound'

describe('shouldPlayNotificationSound', () => {
  it('plays for warnings and errors', () => {
    expect(shouldPlayNotificationSound({ type: 'warning', title: 'Duplicate detected' })).toBe(true)
    expect(shouldPlayNotificationSound({ type: 'error', title: 'OCR failed' })).toBe(true)
  })

  it('only plays for important success notifications', () => {
    expect(shouldPlayNotificationSound({ type: 'success', title: 'PDF upload queued' })).toBe(true)
    expect(shouldPlayNotificationSound({ type: 'success', title: 'Batch restore finished' })).toBe(true)
    expect(shouldPlayNotificationSound({ type: 'success', title: 'Field preferences saved' })).toBe(false)
  })

  it('does not play for ordinary info notifications', () => {
    expect(shouldPlayNotificationSound({ type: 'info', title: 'Receipt upload queued' })).toBe(false)
  })

  it('previews sound only when the user turns the toggle on', () => {
    expect(shouldPreviewNotificationSoundOnToggle(false, true)).toBe(true)
    expect(shouldPreviewNotificationSoundOnToggle(true, false)).toBe(false)
    expect(shouldPreviewNotificationSoundOnToggle(true, true)).toBe(false)
  })
})
