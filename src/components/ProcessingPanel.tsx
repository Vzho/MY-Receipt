import { CheckCircle, Clock, Cpu, FileImage, Loader2, TriangleAlert } from 'lucide-react'
import type { ReceiptProcessingStage } from '../types/receipt'

const stageLabels: Record<ReceiptProcessingStage, string> = {
  uploaded: 'Uploaded',
  ocr_scanning: 'OCR scanning...',
  ai_extracting: 'AI extracting fields...',
  generating_preview: 'Generating preview...',
  ready_for_review: 'Ready for review',
  ocr_failed: 'OCR failed',
}

const stageOrder: ReceiptProcessingStage[] = ['uploaded', 'ocr_scanning', 'ai_extracting', 'generating_preview', 'ready_for_review']

interface ProcessingPanelProps {
  stage?: ReceiptProcessingStage | null
  status?: string | null
  compact?: boolean
  labels?: any
}

export function ProcessingPanel({ stage, status, compact = false, labels }: ProcessingPanelProps) {
  const activeStage = normalizeStage(stage, status)
  const activeIndex = stageOrder.indexOf(activeStage)
  const failed = activeStage === 'ocr_failed'
  const activeIcon = getStageIcon(activeStage, status)
  const stageLabel = (item: ReceiptProcessingStage) => labels?.processingStageLabels?.[item] || stageLabels[item]
  const statusLabel = status ? labels?.optionLabels?.[status] || status : stageLabel(activeStage)

  const progressPercent = failed ? 100 : activeIndex >= 0 ? Math.round(((activeIndex + 1) / stageOrder.length) * 100) : 20

  return (
    <div className={`rounded-2xl border ${failed ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-indigo-100 bg-indigo-50 text-indigo-700'} ${compact ? 'w-72 max-w-full px-2.5 py-1.5' : 'p-4'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {failed ? <TriangleAlert className="h-4 w-4" /> : status === 'processing' || status === 'Processing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
          <span className="truncate text-[10px] font-black uppercase tracking-wide">{activeIcon} {stageLabel(activeStage)}</span>
        </div>
        {!compact && <span className="text-[10px] font-black uppercase opacity-70">{statusLabel}</span>}
      </div>
      {compact && (
        <div className={`mt-1.5 h-1 overflow-hidden rounded-full ${failed ? 'bg-rose-100' : 'bg-indigo-100'}`}>
          <div
            className={`h-full rounded-full transition-all duration-300 ${failed ? 'bg-rose-500' : 'bg-indigo-500'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
      {!compact && (
        <div className="mt-3 grid grid-cols-5 gap-2">
          {stageOrder.map((item, index) => {
            const done = !failed && index <= activeIndex
            return (
              <div key={item} className={`rounded-xl px-2 py-2 ${done ? 'bg-white text-indigo-700 shadow-sm' : 'bg-white/50 text-slate-400'}`}>
                <div className="flex items-center gap-1.5">
                  {index === 0 ? <FileImage className="h-3.5 w-3.5" /> : done ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  <span className="truncate text-[9px] font-black uppercase">{stageLabel(item)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getStageIcon(stage: ReceiptProcessingStage, status?: string | null) {
  if (stage === 'ocr_failed') return '⚠'
  if (stage === 'ai_extracting') return '🧠'
  if (stage === 'generating_preview') return '📊'
  if (stage === 'ready_for_review') return '✅'
  if (stage === 'ocr_scanning' || status === 'processing' || status === 'Processing') return '🔍'
  return '📄'
}

function normalizeStage(stage?: ReceiptProcessingStage | null, status?: string | null): ReceiptProcessingStage {
  if (stage) return stage
  if (status === 'failed' || status === 'Failed') return 'ocr_failed'
  if (status === 'pending_review' || status === 'Pending') return 'ready_for_review'
  if (status === 'processing' || status === 'Processing') return 'ocr_scanning'
  return 'uploaded'
}
