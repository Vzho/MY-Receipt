import { useMemo, useState } from 'react'
import { Bell, CheckCheck, CircleAlert, CircleCheck, Info, Trash2, TriangleAlert } from 'lucide-react'
import type { AppNotification } from '../types/notification'

interface NotificationCenterProps {
  notifications: AppNotification[]
  isOpen: boolean
  colorMode: string
  labels?: any
  onToggle: () => void
  onMarkAllRead: () => void
  onClear: () => void
  onOpenReceipt: (receiptId: string) => void
}

export function NotificationCenter({
  notifications,
  isOpen,
  colorMode,
  labels,
  onToggle,
  onMarkAllRead,
  onClear,
  onOpenReceipt,
}: NotificationCenterProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'attention'>('all')
  const unreadCount = notifications.filter((notification) => !notification.read_at).length
  const attentionCount = notifications.filter((notification) => notification.type === 'error' || notification.type === 'warning').length
  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'unread') return notifications.filter((notification) => !notification.read_at)
    if (activeFilter === 'attention') return notifications.filter((notification) => notification.type === 'error' || notification.type === 'warning')
    return notifications
  }, [activeFilter, notifications])
  const filterOptions = [
    { key: 'all' as const, label: labels?.allNotificationsLabel || '全部', count: notifications.length },
    { key: 'unread' as const, label: labels?.unreadNotificationsLabel || '未读', count: unreadCount },
    { key: 'attention' as const, label: labels?.attentionNotificationsLabel || '需处理', count: attentionCount },
  ]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl border text-slate-500 transition-all shadow-sm ${colorMode === 'Dark' ? 'border-slate-700 bg-slate-800 hover:bg-slate-700' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
        aria-label={labels?.notificationCenterLabel || '消息中心'}
        title={labels?.notificationCenterLabel || '消息中心'}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={`absolute right-0 top-12 z-[160] w-[380px] overflow-hidden rounded-2xl border shadow-2xl ${colorMode === 'Dark' ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
          <div className={`flex items-center justify-between border-b px-4 py-3 ${colorMode === 'Dark' ? 'border-slate-800' : 'border-slate-100'}`}>
            <div>
              <p className="text-xs font-black uppercase tracking-widest">{labels?.notificationCenterLabel || '消息中心'}</p>
              <p className={`mt-0.5 text-[10px] font-bold ${colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{formatNotificationCount(notifications.length, labels)}</p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={onMarkAllRead} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={labels?.markAllReadLabel || '全部标记已读'}>
                <CheckCheck className="h-4 w-4" />
              </button>
              <button type="button" onClick={onClear} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title={labels?.clearNotificationsLabel || '清空消息'}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className={`flex gap-2 border-b px-4 py-3 ${colorMode === 'Dark' ? 'border-slate-800' : 'border-slate-100'}`}>
            {filterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveFilter(option.key)}
                className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase transition ${
                  activeFilter === option.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : colorMode === 'Dark'
                      ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {option.label} {option.count}
              </button>
            ))}
          </div>

          <div className="max-h-[440px] overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="px-5 py-10 text-center text-xs font-bold text-slate-400">{labels?.noNotificationsLabel || '暂无消息'}</div>
            ) : filteredNotifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => notification.receipt_id && onOpenReceipt(notification.receipt_id)}
                disabled={!notification.receipt_id}
                className={`flex w-full gap-3 border-b px-4 py-3 text-left transition last:border-b-0 disabled:cursor-default ${colorMode === 'Dark' ? 'border-slate-800 hover:bg-slate-800/60' : 'border-slate-100 hover:bg-slate-50'} ${notification.read_at ? 'opacity-70' : ''}`}
              >
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${getNotificationTone(notification.type)}`}>
                  {getNotificationIcon(notification.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-xs font-black">{notification.title}</span>
                    {!notification.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                  </span>
                  {notification.message && <span className={`mt-1 block text-[11px] font-semibold leading-5 ${colorMode === 'Dark' ? 'text-slate-400' : 'text-slate-500'}`}>{notification.message}</span>}
                  <span className="mt-2 block text-[9px] font-black uppercase text-slate-400">{formatNotificationTime(notification.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatNotificationCount(count: number, labels?: any) {
  if (typeof labels?.notificationCountLabel === 'function') return labels.notificationCountLabel(count)
  return `${count} 条记录`
}

function getNotificationTone(type: AppNotification['type']) {
  if (type === 'success') return 'bg-emerald-50 text-emerald-700'
  if (type === 'warning') return 'bg-amber-50 text-amber-700'
  if (type === 'error') return 'bg-rose-50 text-rose-700'
  return 'bg-indigo-50 text-indigo-700'
}

function getNotificationIcon(type: AppNotification['type']) {
  if (type === 'success') return <CircleCheck className="h-4 w-4" />
  if (type === 'warning') return <TriangleAlert className="h-4 w-4" />
  if (type === 'error') return <CircleAlert className="h-4 w-4" />
  return <Info className="h-4 w-4" />
}

function formatNotificationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
