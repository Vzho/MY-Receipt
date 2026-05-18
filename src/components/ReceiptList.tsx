import { Trash2 } from 'lucide-react'
import type { Receipt } from '../types/receipt'
import { StatusBadge } from './StatusBadge'

interface ReceiptListProps {
  receipts: Receipt[]
  selectedIds?: string[]
  labels?: {
    noRecords?: string
    noInvoiceLabel?: string
    totalItems?: string
    optionLabels?: Record<string, string>
  }
  onToggleSelect?: (id: string) => void
  onOpen: (receipt: Receipt) => void
  onDelete?: (id: string) => void
}

export function ReceiptList({ receipts, selectedIds = [], labels, onToggleSelect, onOpen, onDelete }: ReceiptListProps) {
  if (receipts.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">{labels?.noRecords || '没有记录'}</div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {receipts.map((receipt) => (
        <div
          key={receipt.id}
          className="grid cursor-pointer grid-cols-[auto_1fr_auto] gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50"
          onClick={() => onOpen(receipt)}
        >
          {onToggleSelect ? (
            <input
              type="checkbox"
              checked={selectedIds.includes(receipt.id)}
              onClick={(event) => event.stopPropagation()}
              onChange={() => onToggleSelect(receipt.id)}
              className="mt-1 h-4 w-4"
            />
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-black text-slate-900">{receipt.merchant_name || receipt.display_filename || receipt.filename}</p>
              <StatusBadge status={receipt.status} />
            </div>
            <p className="mt-1 text-xs font-bold text-slate-400">
              {receipt.date || '-'} / {receipt.invoice_no || labels?.noInvoiceLabel || '无发票号'} / {receipt.receipt_items?.length || 0} {labels?.totalItems || '条目'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(receipt.tags || []).map((tag) => (
                <span key={tag} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                  {labels?.optionLabels?.[tag] || tag}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-black text-slate-900">RM {Number(receipt.grand_total || 0).toFixed(2)}</p>
              <p className="text-[10px] font-bold uppercase text-slate-400">{labels?.optionLabels?.[receipt.doc_type] || receipt.doc_type}</p>
            </div>
            {onDelete ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete(receipt.id)
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
