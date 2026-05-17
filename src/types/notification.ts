export type AppNotificationType = 'success' | 'warning' | 'error' | 'info'

export interface AppNotification {
  id: string
  type: AppNotificationType
  title: string
  message?: string
  receipt_id?: string
  created_at: string
  read_at?: string | null
}
