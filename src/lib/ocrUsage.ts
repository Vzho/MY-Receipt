import type { OcrQuotaSummary, OcrUsageMonthly } from '../types/ocrUsage'

export const DEFAULT_OCR_QUOTAS: Record<string, { label: string; limit: number }> = {
  tencent: { label: 'Tencent OCR', limit: 900 },
  qwen_vl: { label: 'Qwen VL', limit: 100 },
  deepseek_v4: { label: 'DeepSeek Repair', limit: 500 },
}

export function currentOcrUsagePeriod(date = new Date()) {
  return date.toISOString().slice(0, 7)
}

export function summarizeOcrUsage(
  usage: OcrUsageMonthly[],
  quotas: Record<string, { label: string; limit: number }> = DEFAULT_OCR_QUOTAS,
): OcrQuotaSummary[] {
  return Object.entries(quotas).map(([provider, quota]) => {
    const providerRows = usage.filter((item) => item.provider === provider)
    const used = providerRows.reduce((sum, item) => sum + Math.max(0, Math.round(Number(item.units) || 0)), 0)
    const configuredLimit = providerRows
      .map((item) => Math.round(Number(item.monthly_limit) || 0))
      .find((limit) => limit > 0)
    const limit = Math.max(1, configuredLimit || quota.limit)
    return {
      provider,
      label: quota.label,
      used,
      limit,
      percent: Math.min(100, Math.round((used / limit) * 100)),
    }
  })
}
