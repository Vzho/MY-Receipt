export interface OcrUsageMonthly {
  user_id: string
  period: string
  provider: string
  units: number
  updated_at?: string | null
}

export interface OcrQuotaSummary {
  provider: string
  label: string
  used: number
  limit: number
  percent: number
}
