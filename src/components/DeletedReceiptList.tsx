import { MessageSquareText, RotateCcw, Trash2 } from 'lucide-react'
import type { Receipt } from '../types/receipt'
import { buildReuploadRequestMessage } from '../lib/reuploadTemplate'

interface DeletedReceiptListProps {
  receipts: Receipt[]
  selectedIds?: string[]
  onToggleSelect?: (id: string) => void
  onOpen?: (id: string) => void
  onCopyReuploadMessage?: (message: string) => void
  onRestore: (id: string) => void
  onPermanentDelete: (id: string) => void
}

export function DeletedReceiptList({ receipts, selectedIds = [], onToggleSelect, onOpen, onCopyReuploadMessage, onRestore, onPermanentDelete }: DeletedReceiptListProps) {
  if (receipts.length === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs font-bold text-slate-400">暂无已删除收据</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {receipts.map((receipt) => (
        <div key={receipt.id} className="grid grid-cols-[auto_1fr_auto] gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0">
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
              {receipt.deleted_reason || 'other'} / {receipt.deleted_at?.slice(0, 10) || '-'} / {receipt.deleted_note || 'No note'}
            </p>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onCopyReuploadMessage?.(buildReuploadRequestMessage(receipt))} className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-100">
              <MessageSquareText className="mr-1 inline h-3.5 w-3.5" /> Copy note
            </button>
            <button type="button" onClick={() => onRestore(receipt.id)} className="rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100">
              <RotateCcw className="mr-1 inline h-3.5 w-3.5" /> Restore
            </button>
            <button type="button" onClick={() => onPermanentDelete(receipt.id)} className="rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-100">
              <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
