import { useState } from 'react'
import { Cpu, FileText } from 'lucide-react'

interface UploadQueueItem {
  id: string
  name: string
  status: string
  progress: number
}

interface UploadQueueProps {
  items: UploadQueueItem[]
  visibleLimit?: number
  processingLabel: string
  config: {
    colorMode: string
    theme: {
      color: string
      light: string
      text: string
    }
  }
}

function normalizeProgress(value: number) {
  const progress = Number(value)
  if (!Number.isFinite(progress)) return 0
  return Math.max(0, Math.min(100, Math.round(progress)))
}

export function UploadQueue({ items, visibleLimit = 10, processingLabel, config }: UploadQueueProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (items.length === 0) return null

  const normalizedLimit = Math.max(1, Math.round(Number(visibleLimit) || 10))
  const visibleItems = isExpanded ? items : items.slice(0, normalizedLimit)
  const hiddenCount = Math.max(0, items.length - normalizedLimit)

  return (
    <div className={`rounded-[24px] border overflow-hidden shadow-sm transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
      <div className={`px-6 py-3 border-b flex items-center justify-between ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-900/80' : 'border-slate-100 bg-slate-50/80'}`}>
        <span className={`text-[10px] font-black uppercase flex items-center gap-2 ${config.theme.text}`}>
          <Cpu className="w-3.5 h-3.5 animate-pulse" /> {processingLabel}
        </span>
      </div>
      {visibleItems.map((item) => {
        const progress = normalizeProgress(item.progress)

        return (
          <div key={item.id} className={`px-6 py-4 flex items-center justify-between gap-4 border-b last:border-0 ${config.colorMode === 'Dark' ? 'border-slate-800/50' : 'border-slate-50'}`}>
            <div className="flex min-w-0 items-center gap-4">
              <div className={`w-8 h-8 rounded-lg flex shrink-0 items-center justify-center ${config.theme.light} ${config.theme.text} ${config.colorMode === 'Dark' ? 'bg-indigo-900/30' : ''}`}>
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{item.name}</p>
                <p className="truncate text-[10px] font-black opacity-50 uppercase">{item.status}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`w-10 text-right text-[10px] font-black tabular-nums ${config.colorMode === 'Dark' ? 'text-slate-400' : 'text-slate-500'}`}>{progress}%</span>
              <div className={`h-1.5 w-48 overflow-hidden rounded-full ${config.colorMode === 'Dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <div className={`${config.theme.color} h-full transition-all duration-300`} style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        )
      })}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className={`w-full px-6 py-3 text-center text-[10px] font-black uppercase tracking-wider transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 text-slate-400 hover:bg-slate-800' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
        >
          {isExpanded ? 'Show less' : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  )
}
