import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Clock,
  Copy,
  ImageIcon,
  Loader2,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import { ProcessingPanel } from './ProcessingPanel'
import { WarningPanel } from './WarningPanel'

const TAG_DISPLAY_ORDER = ['Business', 'Personal', 'Tax Deductible', 'Pending']

function getTagsForDisplay(tags: unknown) {
  if (!Array.isArray(tags)) return []

  const uniqueTags = tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .filter((tag, index, list) => list.indexOf(tag) === index)
  const originalIndexByTag = new Map(uniqueTags.map((tag, index) => [tag, index]))

  return uniqueTags.sort((a, b) => {
    const aIndex = TAG_DISPLAY_ORDER.indexOf(a)
    const bIndex = TAG_DISPLAY_ORDER.indexOf(b)
    const aKnown = aIndex !== -1
    const bKnown = bIndex !== -1

    if (aKnown && bKnown) return aIndex - bIndex
    if (aKnown) return -1
    if (bKnown) return 1
    return (originalIndexByTag.get(a) ?? 0) - (originalIndexByTag.get(b) ?? 0)
  })
}

interface ReceiptTableLabels {
  sequenceLabel?: string
  merchantLabel: string
  thumbnailLabel: string
  financialsLabel: string
  tagsLabel: string
  auditLabel: string
  retry: string
  loadingRecords?: string
  noRecords: string
  totalItems: string
}

interface ReceiptTableProps {
  items: any[]
  selectedRowIds: string[]
  labels: ReceiptTableLabels
  config: {
    colorMode: string
    currency: string
    theme: {
      color: string
    }
  }
  isSelectableForBulk: (item: any) => boolean
  onToggleSelectAll: () => void
  onToggleSelectRow: (id: string, event: React.MouseEvent) => void
  onOpenReceipt: (item: any) => void
  onOpenThumbnail: (imageUrl: string) => void
  onCopyText: (value: string | null | undefined, label: string, event?: React.MouseEvent) => void
  onRetry: (id: string) => void
  onDelete: (id: string, event?: React.MouseEvent) => void
  pageSize?: number
  isLoading?: boolean
}

export function ReceiptTable({
  items,
  selectedRowIds,
  labels,
  config,
  isSelectableForBulk,
  onToggleSelectAll,
  onToggleSelectRow,
  onOpenReceipt,
  onOpenThumbnail,
  onCopyText,
  onRetry,
  onDelete,
  pageSize = 10,
  isLoading = false,
}: ReceiptTableProps) {
  const normalizedPageSize = Math.max(1, Math.round(Number(pageSize) || 10))
  const [page, setPage] = useState(1)
  const visibleItems = useMemo(() => items.filter((item) => item.status !== 'Synced'), [items])
  const selectableItems = visibleItems.filter(isSelectableForBulk)
  const allSelectableChecked = selectedRowIds.length === selectableItems.length && selectableItems.length > 0
  const pageCount = Math.max(1, Math.ceil(visibleItems.length / normalizedPageSize))
  const currentPage = Math.min(page, pageCount)
  const pageItems = visibleItems.slice((currentPage - 1) * normalizedPageSize, currentPage * normalizedPageSize)

  useEffect(() => {
    setPage(1)
  }, [items, normalizedPageSize])

  return (
    <div className={`rounded-[24px] border shadow-sm overflow-hidden transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
      <table className="w-full text-left">
        <thead className={`text-[10px] font-black uppercase tracking-widest border-b ${config.colorMode === 'Dark' ? 'bg-slate-800/50 text-slate-500 border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
          <tr>
            <th className="px-6 py-4 w-10">
              <input
                type="checkbox"
                checked={allSelectableChecked}
                onChange={onToggleSelectAll}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
            </th>
            <th className="px-3 py-4 w-14 text-center">{labels.sequenceLabel || 'No.'}</th>
            <th className="px-6 py-4">{labels.merchantLabel}</th>
            <th className="px-4 py-4 w-[120px]">{labels.thumbnailLabel}</th>
            <th className="px-6 py-4">{labels.financialsLabel}</th>
            <th className="px-6 py-4">{labels.tagsLabel}</th>
            <th className="px-6 py-4 text-right">{labels.auditLabel}</th>
          </tr>
        </thead>
        <tbody className={`divide-y ${config.colorMode === 'Dark' ? 'divide-slate-800' : 'divide-slate-100'}`}>
          {isLoading && visibleItems.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs font-bold">
                {labels.loadingRecords || 'Loading receipts...'}
              </td>
            </tr>
          ) : pageItems.map((item, pageIndex) => {
            const thumbnailUrl = item.processed_image_url || item.image_url || item.original_image_url
            const rowNumber = (currentPage - 1) * normalizedPageSize + pageIndex + 1
            return (
              <tr
                key={item.id}
                className={`transition-colors group cursor-pointer ${selectedRowIds.includes(item.id) ? (config.colorMode === 'Dark' ? 'bg-indigo-900/20' : 'bg-indigo-50/50') : ''} ${config.colorMode === 'Dark' ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}
                onClick={() => onOpenReceipt(item)}
              >
                <td className="px-6 py-5" onClick={(event) => onToggleSelectRow(item.id, event)}>
                  <input
                    type="checkbox"
                    checked={selectedRowIds.includes(item.id)}
                    disabled={!isSelectableForBulk(item)}
                    onChange={() => {}}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </td>
                <td className={`px-3 py-5 text-center text-xs font-black tabular-nums ${config.colorMode === 'Dark' ? 'text-slate-600' : 'text-slate-400'}`} aria-label={`Receipt row number ${rowNumber}`}>
                  {rowNumber}
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {item.status === 'Failed' ? (
                        <AlertCircle className="w-5 h-5 text-rose-500" />
                      ) : item.status === 'Processing' ? (
                        <Loader2 className={`w-5 h-5 animate-spin ${config.colorMode === 'Dark' ? 'text-indigo-400' : 'text-indigo-600'}`} />
                      ) : item.status === 'Uploaded' ? (
                        <Clock className={`w-5 h-5 ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`} />
                      ) : (
                        <CheckCircle className={`w-5 h-5 ${config.colorMode === 'Dark' ? 'text-amber-600' : 'text-amber-500'}`} />
                      )}
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <p className={`text-sm font-black leading-tight ${item.status === 'Failed' ? 'text-rose-600' : config.colorMode === 'Dark' ? 'text-slate-200' : 'text-slate-800'}`}>
                          {item.merchant_name || item.display_filename || item.filename || 'Processing receipt'}
                        </p>
                        {item.merchant_name && (
                          <button type="button" onClick={(event) => onCopyText(item.merchant_name, 'Merchant', event)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="复制商户名">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className={`text-[9px] font-bold uppercase ${config.colorMode === 'Dark' ? 'text-slate-600' : 'text-slate-400'}`}>
                          {item.status === 'Uploaded' ? 'Ready for crop and smart parse' : item.status === 'Processing' ? 'Smart parsing in background' : `INV: ${item.invoice_no || 'N/A'}`}
                        </span>
                        {item.source_page_label && (
                          <span className={`text-[9px] font-bold uppercase ${config.colorMode === 'Dark' ? 'text-slate-600' : 'text-slate-400'}`}>
                            {item.source_page_label}
                          </span>
                        )}
                        {item.invoice_no && (
                          <button type="button" onClick={(event) => onCopyText(item.invoice_no, 'Invoice No', event)} className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="复制 Invoice No.">
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex max-w-xl flex-col gap-1.5">
                        <ProcessingPanel stage={item.processing_stage} status={item.status} compact />
                        <WarningPanel warnings={item.warnings} compact />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-5">
                  {thumbnailUrl ? (
                    <button
                      type="button"
                      aria-label="放大发票图片"
                      title="放大发票图片"
                      onClick={(event) => {
                        event.stopPropagation()
                        onOpenThumbnail(thumbnailUrl)
                      }}
                      className={`group/thumb h-20 w-14 overflow-hidden rounded-lg border transition-all ${config.colorMode === 'Dark' ? 'border-slate-700 bg-slate-800 hover:border-indigo-400' : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:shadow-md'}`}
                    >
                      <img
                        src={thumbnailUrl}
                        alt="Receipt thumbnail"
                        className="h-full w-full object-cover transition-transform duration-200 group-hover/thumb:scale-105"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </button>
                  ) : (
                    <div className={`flex h-20 w-14 items-center justify-center rounded-lg border border-dashed ${config.colorMode === 'Dark' ? 'border-slate-700 bg-slate-800 text-slate-600' : 'border-slate-200 bg-slate-50 text-slate-300'}`}>
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </td>
                <td className="px-6 py-5">
                  <p className={`text-sm font-black leading-none mb-1 ${config.colorMode === 'Dark' ? 'text-slate-200' : 'text-slate-900'}`}>{config.currency} {parseFloat(item.grand_total as any).toFixed(2)}</p>
                  <p className={`text-[10px] font-bold ${config.colorMode === 'Dark' ? 'text-slate-600' : 'text-slate-400'}`}>{item.date} - {item.items?.length || 0} SKUs</p>
                </td>
              <td className="px-6 py-5">
                <div className="flex flex-col gap-1.5 items-start">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${item.status === 'Failed' ? 'bg-rose-50 text-rose-600' : item.status === 'Processing' ? 'bg-indigo-50 text-indigo-600' : config.colorMode === 'Dark' ? 'bg-indigo-950 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                    {item.status === 'Uploaded' ? 'Uploaded' : item.status === 'Processing' ? 'Processing' : item.doc_type}
                  </span>
                  <div className="flex max-w-40 flex-wrap gap-1">
                    {getTagsForDisplay(item.tags).map((tag) => <span key={tag} className={`text-[8px] font-black uppercase px-1 rounded ${config.colorMode === 'Dark' ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-500'}`}>{tag}</span>)}
                  </div>
                </div>
              </td>
              <td className="px-6 py-5 text-right">
                <div className="flex items-center justify-end gap-2">
                  {item.status === 'Failed' ? (
                    <button onClick={(event) => { event.stopPropagation(); onRetry(item.id); }} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1">
                      <RefreshCcw className="w-3 h-3" /> {labels.retry}
                    </button>
                  ) : (
                    <button className={`p-2 rounded-xl transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 text-slate-500 group-hover:bg-indigo-600 group-hover:text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                  <button onClick={(event) => onDelete(item.id, event)} className={`p-2 rounded-xl transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 text-slate-500 hover:bg-rose-600 hover:text-white' : 'bg-slate-100 text-slate-400 hover:bg-rose-600 hover:text-white'}`} title="删除">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
              </tr>
            )
          })}
          {!isLoading && visibleItems.length === 0 && (
            <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-xs font-bold">{labels.noRecords}</td></tr>
          )}
        </tbody>
      </table>
      <div className={`px-6 py-3 border-t flex flex-wrap justify-between gap-3 items-center text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'bg-slate-800/30 border-slate-800 text-slate-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
        <span>Total: {visibleItems.length} {labels.totalItems}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span>Page {currentPage} of {pageCount}</span>
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
