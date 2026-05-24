import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArchiveX, Trash2, X } from 'lucide-react'

export type DeleteDialogMode = 'soft' | 'permanent'

export type DeleteDialogSubmitPayload = {
  reason?: string
  note?: string
}

interface DeleteReceiptDialogProps {
  mode: DeleteDialogMode
  count: number
  receiptName?: string | null
  defaultReason?: string
  isSubmitting?: boolean
  labels?: any
  colorMode: string
  onCancel: () => void
  onConfirm: (payload: DeleteDialogSubmitPayload) => void
}

const DELETE_REASONS = [
  'blurry_image',
  'duplicate',
  'amount_not_clear',
  'not_receipt',
  'missing_required_info',
  'other',
]

export function DeleteReceiptDialog({
  mode,
  count,
  receiptName,
  defaultReason = 'other',
  isSubmitting = false,
  labels,
  colorMode,
  onCancel,
  onConfirm,
}: DeleteReceiptDialogProps) {
  const [reason, setReason] = useState(defaultReason)
  const [note, setNote] = useState('')
  const isPermanent = mode === 'permanent'

  useEffect(() => {
    setReason(defaultReason)
    setNote('')
  }, [defaultReason, mode, count])

  const title = useMemo(() => {
    if (isPermanent) {
      if (count > 1 && typeof labels?.batchPermanentDeleteDialogTitle === 'function') return labels.batchPermanentDeleteDialogTitle(count)
      return labels?.permanentDeleteDialogTitle || labels?.deletePermanentlyLabel || '永久删除'
    }
    if (count > 1 && typeof labels?.batchDeleteDialogTitle === 'function') return labels.batchDeleteDialogTitle(count)
    return labels?.deleteDialogTitle || labels?.deleteLabel || '删除收据'
  }, [count, isPermanent, labels])

  const description = useMemo(() => {
    if (isPermanent) {
      if (count > 1 && typeof labels?.batchPermanentDeleteDialogDescription === 'function') return labels.batchPermanentDeleteDialogDescription(count)
      return labels?.permanentDeleteDialogDescription || labels?.permanentDeleteConfirmLabel || ''
    }
    if (count > 1 && typeof labels?.batchDeleteDialogDescription === 'function') return labels.batchDeleteDialogDescription(count)
    if (typeof labels?.deleteDialogDescription === 'function') return labels.deleteDialogDescription(receiptName || labels?.receiptLabel || 'receipt')
    return labels?.deletePromptLabel || ''
  }, [count, isPermanent, labels, receiptName])

  const confirmLabel = isPermanent
    ? labels?.confirmPermanentDeleteLabel || labels?.deletePermanentlyLabel || '永久删除'
    : labels?.confirmDeleteLabel || labels?.deleteLabel || '删除'

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
      <div className={`w-full max-w-lg overflow-hidden rounded-[28px] border shadow-2xl ${colorMode === 'Dark' ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-950'}`}>
        <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${colorMode === 'Dark' ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex min-w-0 gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isPermanent ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>
              {isPermanent ? <Trash2 className="h-5 w-5" /> : <ArchiveX className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-black tracking-tight">{title}</h3>
              <p className={`mt-1 text-xs font-semibold leading-5 ${colorMode === 'Dark' ? 'text-slate-400' : 'text-slate-500'}`}>{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className={`rounded-xl p-2 transition ${colorMode === 'Dark' ? 'text-slate-500 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'} disabled:cursor-wait disabled:opacity-60`}
            aria-label={labels?.cancelLabel || '取消'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {isPermanent ? (
            <div className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-xs font-bold leading-5">{labels?.permanentDeleteWarningLabel || '此操作会移除数据库记录和 Storage 文件，无法在 Rejected 库恢复。'}</p>
            </div>
          ) : (
            <>
              <label className="block">
                <span className={`text-[10px] font-black uppercase tracking-wider ${colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels?.deleteReasonLabel || labels?.rejectedReasonLabel || '删除原因'}</span>
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className={`mt-2 w-full rounded-2xl border px-4 py-3 text-sm font-black outline-none transition ${colorMode === 'Dark' ? 'border-slate-700 bg-slate-800 text-slate-100 focus:border-indigo-500' : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-indigo-500'}`}
                >
                  {DELETE_REASONS.map((option) => (
                    <option key={option} value={option}>{labels?.deleteReasonOptions?.[option] || option}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={`text-[10px] font-black uppercase tracking-wider ${colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels?.deleteNoteLabel || labels?.noNoteLabel || '备注'}</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={labels?.deleteNotePlaceholder || ''}
                  className={`mt-2 min-h-24 w-full resize-none rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition ${colorMode === 'Dark' ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-600 focus:border-indigo-500' : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500'}`}
                />
              </label>
            </>
          )}
        </div>

        <div className={`flex flex-wrap justify-end gap-3 border-t px-6 py-4 ${colorMode === 'Dark' ? 'border-slate-800 bg-slate-900/70' : 'border-slate-100 bg-slate-50/80'}`}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className={`rounded-2xl px-5 py-3 text-xs font-black uppercase transition ${colorMode === 'Dark' ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-white text-slate-600 shadow-sm hover:bg-slate-100'} disabled:cursor-wait disabled:opacity-60`}
          >
            {labels?.cancelLabel || '取消'}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(isPermanent ? {} : { reason, note })}
            disabled={isSubmitting || (!isPermanent && !reason)}
            className={`rounded-2xl px-5 py-3 text-xs font-black uppercase text-white shadow-lg transition disabled:cursor-wait disabled:opacity-60 ${isPermanent ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-600 hover:bg-amber-500'}`}
          >
            {isSubmitting ? (labels?.processingActionLabel || labels?.renderingLabel || '处理中') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
