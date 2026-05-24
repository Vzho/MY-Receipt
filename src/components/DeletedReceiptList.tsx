import { ArchiveX, MessageSquareText, RotateCcw, Trash2 } from 'lucide-react'
import type { Receipt } from '../types/receipt'
import { buildReuploadRequestMessage } from '../lib/reuploadTemplate'

interface DeletedReceiptListProps {
  receipts: Receipt[]
  selectedIds?: string[]
  labels?: any
  onToggleSelect?: (id: string) => void
  onOpen?: (id: string) => void
  onCopyReuploadMessage?: (message: string) => void
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
}

export function DeletedReceiptList({ receipts, selectedIds = [], labels, onToggleSelect, onOpen, onCopyReuploadMessage, onRestore, onPermanentDelete }: DeletedReceiptListProps) {
  if (receipts.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-8 py-12 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <ArchiveX className="h-5 w-5" />
        </div>
        <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">{labels?.noDeletedReceiptsLabel || '暂无已删除收据'}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      {receipts.map((receipt) => (
        <div key={receipt.id} className="grid grid-cols-[auto_1fr] gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 lg:grid-cols-[auto_1fr_auto]">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={selectedIds.includes(receipt.id)}
              onChange={() => onToggleSelect?.(receipt.id)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
          </div>
          <button type="button" onClick={() => onOpen?.(receipt.id)} className="min-w-0 text-left">
            <p className="truncate text-sm font-black text-slate-900">{receipt.merchant_name || receipt.display_filename || receipt.filename}</p>
            <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">
              {receipt.deleted_reason || 'other'} / {receipt.deleted_at?.slice(0, 10) || '-'} / {receipt.deleted_note || labels?.noNoteLabel || 'No note'}
            </p>
          </button>
          <div className="col-span-2 flex flex-wrap items-center gap-2 pl-8 lg:col-span-1 lg:justify-end lg:pl-0">
            <button type="button" onClick={() => onCopyReuploadMessage?.(buildReuploadRequestMessage(receipt))} className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-100">
              <MessageSquareText className="mr-1 inline h-3.5 w-3.5" /> {labels?.copyNoteLabel || 'Copy note'}
            </button>
            <button type="button" onClick={() => onRestore(receipt.id)} className="rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100">
              <RotateCcw className="mr-1 inline h-3.5 w-3.5" /> {labels?.restoreLabel || 'Restore'}
            </button>
            <button type="button" onClick={() => onPermanentDelete(receipt.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-100">
              <Trash2 className="mr-1 inline h-3.5 w-3.5" /> {labels?.deletePermanentlyLabel || labels?.deleteLabel || 'Delete'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
