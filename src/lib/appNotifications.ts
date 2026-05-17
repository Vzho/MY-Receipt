import type { AppNotification, AppNotificationType } from '../types/notification'

export const APP_NOTIFICATION_LIMIT = 100
export const APP_NOTIFICATION_STORAGE_KEY = 'resitai_notifications_v1'

export type AppNotificationInput = {
  type: AppNotificationType
  title: string
  message?: string
  receipt_id?: string
}

export function createAppNotification(input: AppNotificationInput, now = new Date()): AppNotification {
  return {
    id: buildNotificationId(now),
    type: input.type,
    title: input.title.trim(),
    message: input.message?.trim() || undefined,
    receipt_id: input.receipt_id || undefined,
    created_at: now.toISOString(),
    read_at: null,
  }
}

export function prependAppNotification(
  notifications: AppNotification[],
  notification: AppNotification,
  limit = APP_NOTIFICATION_LIMIT,
): AppNotification[] {
  return [notification, ...notifications].slice(0, limit)
}

export function markAppNotificationsRead(notifications: AppNotification[], readAt = new Date().toISOString()): AppNotification[] {
  return notifications.map((notification) => (
    notification.read_at ? notification : { ...notification, read_at: readAt }
  ))
}

export function loadAppNotifications(storageKey = APP_NOTIFICATION_STORAGE_KEY, storage = globalThis.localStorage): AppNotification[] {
  try {
    const raw = storage?.getItem(storageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isAppNotification).slice(0, APP_NOTIFICATION_LIMIT)
  } catch {
    return []
  }
}

export function saveAppNotifications(
  notifications: AppNotification[],
  storageKey = APP_NOTIFICATION_STORAGE_KEY,
  storage = globalThis.localStorage,
) {
  try {
    storage?.setItem(storageKey, JSON.stringify(notifications.slice(0, APP_NOTIFICATION_LIMIT)))
  } catch {
    // localStorage can be unavailable in private mode; notifications are best-effort.
  }
}

function isAppNotification(value: unknown): value is AppNotification {
  const candidate = value as Partial<AppNotification>
  return Boolean(
    candidate
    && typeof candidate.id === 'string'
    && typeof candidate.type === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.created_at === 'string',
  )
}

function buildNotificationId(now: Date) {
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  return `notice-${now.getTime()}-${randomSuffix}`
}
