import { Gauge } from 'lucide-react'
import { summarizeOcrUsage } from '../lib/ocrUsage'
import type { OcrUsageMonthly } from '../types/ocrUsage'

interface OcrQuotaProgressProps {
  usage: OcrUsageMonthly[]
  colorMode: string
  labels?: any
}

export function OcrQuotaProgress({ usage, colorMode, labels }: OcrQuotaProgressProps) {
  const rows = summarizeOcrUsage(usage)
  const activeRows = rows.filter((row) => row.used > 0)
  const displayRows = activeRows.length > 0 ? activeRows : rows

  return (
    <section className={`rounded-3xl border p-5 shadow-sm ${colorMode === 'Dark' ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-[2px] ${colorMode === 'Dark' ? 'text-slate-400' : 'text-slate-500'}`}>
            <Gauge className="h-4 w-4" /> {labels?.ocrQuotaLabel || 'Monthly processing usage'}
          </p>
          <p className={`mt-1 text-[11px] font-bold ${colorMode === 'Dark' ? 'text-slate-400' : 'text-slate-500'}`}>
            {labels?.ocrUsageNoteLabel || 'Internal monthly usage limits, not live vendor balance.'}
          </p>
        </div>
        <div className={`rounded-2xl px-3 py-2 text-[10px] font-black uppercase ${colorMode === 'Dark' ? 'bg-slate-950/60 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
          {typeof labels?.ocrUsageCallCountLabel === 'function'
            ? labels.ocrUsageCallCountLabel(displayRows.reduce((sum, row) => sum + row.used, 0))
            : `${displayRows.reduce((sum, row) => sum + row.used, 0)} calls`}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {displayRows.map((row) => (
          <div key={row.provider} className={`rounded-2xl px-3 py-2 ${colorMode === 'Dark' ? 'bg-slate-950/50' : 'bg-slate-50'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[10px] font-black uppercase text-slate-500">{row.label}</span>
              <span className="text-[10px] font-black tabular-nums text-slate-500">{row.used}/{row.limit}</span>
            </div>
            <div className={`mt-2 h-1.5 overflow-hidden rounded-full ${colorMode === 'Dark' ? 'bg-slate-800' : 'bg-white'}`}>
              <div className={`h-full rounded-full ${row.percent >= 90 ? 'bg-rose-500' : row.percent >= 70 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${row.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
