import { memo, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import {
  AlertTriangle,
  Building2,
  Calculator,
  CheckCircle,
  Cpu,
  Eye,
  FileOutput,
  Plus,
  Save,
  ShoppingCart,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react'
import { calculateReceiptMath } from '../lib/receiptMath'
import { buildSubsidyRows, formatSubsidyHeadline, getSubsidyPayable, hasSubsidyDetails } from '../lib/subsidyDetails'
import type { FieldKey } from '../types/fieldConfig'
import { CustomDocTypeInput } from './CustomDocTypeInput'
import { ProcessingPanel } from './ProcessingPanel'
import { ReceiptDetailPanel } from './ReceiptDetailPanel'
import { SoftSelect } from './SoftSelect'
import { WarningPanel } from './WarningPanel'

interface RepairProgressState {
  receiptId: string
  percent: number
  label: string
  mode: 'deepseek' | 'vision' | 'smart'
}

interface ReviewConfig {
  colorMode: string
  currency: string
  theme: {
    color: string
    text: string
    light: string
  }
}

interface ReceiptReviewDrawerProps {
  receipt: any
  config: ReviewConfig
  labels: Record<string, any>
  documentTypeOptions: string[]
  industries: string[]
  tagOptions: string[]
  activeRepairProgress: RepairProgressState | null
  isExporting: boolean
  isSmartParsing: boolean
  isFieldVisible: (fieldKey: FieldKey) => boolean
  onReceiptChange: (receipt: any) => void
  onClose: () => void
  onSmartParse: () => void
  onExport: () => void
  onRestore: () => void
  onPermanentDelete: () => void
  onSync: () => void
  onSaveCustomDocType: (value: string) => void | Promise<void>
  onZoomImage: (url: string) => void
}

function ReceiptReviewDrawerComponent({
  receipt,
  config,
  labels,
  documentTypeOptions,
  industries,
  tagOptions,
  activeRepairProgress,
  isExporting,
  isSmartParsing,
  isFieldVisible,
  onReceiptChange,
  onClose,
  onSmartParse,
  onExport,
  onRestore,
  onPermanentDelete,
  onSync,
  onSaveCustomDocType,
  onZoomImage,
}: ReceiptReviewDrawerProps) {
  const [imagePreviewMode, setImagePreviewMode] = useState<'processed' | 'original'>(receipt.processed_image_url ? 'processed' : 'original')
  const [customDocTypeInput, setCustomDocTypeInput] = useState(receipt.custom_doc_type || '')
  const [newTagInput, setNewTagInput] = useState('')

  useEffect(() => {
    setImagePreviewMode(receipt.processed_image_url ? 'processed' : 'original')
  }, [receipt.id, receipt.processed_image_url])

  useEffect(() => {
    setCustomDocTypeInput(receipt.custom_doc_type || '')
  }, [receipt.id, receipt.custom_doc_type])

  const selectedReceiptImageUrl = useMemo(() => {
    if (imagePreviewMode === 'original') {
      return receipt.original_image_url || receipt.image_url || null
    }
    return receipt.processed_image_url || receipt.image_url || receipt.original_image_url || null
  }, [imagePreviewMode, receipt])

  const itemsTotal = useMemo(() => {
    return receipt?.items?.reduce((sum: number, item: any) => sum + (Number(item.line_total) || 0), 0) || 0
  }, [receipt])

  const grandTotal = Number(receipt.grand_total) || 0
  const receiptMath = useMemo(() => calculateReceiptMath({
    itemTotal: itemsTotal,
    subtotal: receipt.subtotal,
    discount: receipt.discount,
    tax: receipt.tax_sst,
    serviceCharge: receipt.service_charge,
    rounding: receipt.rounding,
    grandTotal,
  }), [grandTotal, itemsTotal, receipt.discount, receipt.rounding, receipt.service_charge, receipt.subtotal, receipt.tax_sst])
  const manualTotal = receiptMath.calculatedTotal

  const subsidyRows = useMemo(() => buildSubsidyRows(receipt.subsidy_details, config.currency), [config.currency, receipt.subsidy_details])
  const subsidyPayable = useMemo(() => getSubsidyPayable(receipt.subsidy_details), [receipt.subsidy_details])
  const hasItemQualityWarning = receipt?.raw_ai?.parser_meta?.item_quality === 'low'
    || /line item names look unreliable/i.test(receipt?.raw_ai?.parser_note || '')

  const updateReceipt = (patch: Record<string, unknown>) => {
    onReceiptChange({ ...receipt, ...patch })
  }

  const updateItem = (itemId: string, field: string, value: any) => {
    const newItems = (receipt.items || []).map((item: any) => {
      if (item.id !== itemId) return item
      const updated = { ...item, [field]: value }
      if (field === 'qty' || field === 'unit_price') {
        const qty = parseFloat(updated.qty) || 0
        const price = parseFloat(updated.unit_price) || 0
        updated.line_total = qty * price
      }
      return updated
    })
    updateReceipt({ items: newItems })
  }

  const addNewItem = () => {
    const newItem = { id: Math.random().toString(36).slice(2, 11), name: '', qty: 1, unit_price: '', line_total: 0 }
    updateReceipt({ items: [...(receipt.items || []), newItem] })
  }

  const removeItem = (itemId: string) => {
    updateReceipt({ items: (receipt.items || []).filter((item: any) => item.id !== itemId) })
  }

  const toggleTag = (tag: string) => {
    const currentTags = receipt.tags || []
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((item: string) => item !== tag)
      : [...currentTags, tag]
    updateReceipt({ tags: newTags })
  }

  const handleAddCustomTag = (event?: KeyboardEvent<HTMLInputElement>) => {
    event?.preventDefault()
    const value = newTagInput.trim()
    if (!value) return
    const currentTags = receipt.tags || []
    if (!currentTags.includes(value)) {
      updateReceipt({ tags: [...currentTags, value] })
    }
    setNewTagInput('')
  }

  const handleCustomDocTypeChange = (value: string) => {
    setCustomDocTypeInput(value)
    updateReceipt({ doc_type: 'Custom (自定义)', custom_doc_type: value })
  }

  const handleSaveCustomDocType = () => {
    const value = customDocTypeInput.trim()
    if (value) void onSaveCustomDocType(value)
  }

  const smartParseLabel = activeRepairProgress?.mode === 'smart'
    ? `${labels.smartParseLabel || 'Smart parse'} ${activeRepairProgress.percent}%`
    : receipt.status === 'Processing'
      ? labels.smartParsingLabel || 'Smart parsing'
      : labels.smartParseLabel || 'Smart parse'

  const mathDelta = manualTotal - grandTotal
  const mathPassed = Math.abs(mathDelta) < 0.05
  const warningCount = Array.isArray(receipt.warnings) ? receipt.warnings.length : 0
  const itemCount = Array.isArray(receipt.items) ? receipt.items.length : 0
  const statusLabel = labels.optionLabels?.[receipt.status] || labels.statusLabels?.[receipt.status] || receipt.status

  return (
    <ReceiptDetailPanel colorMode={config.colorMode}>
      <div className={`px-8 py-4 border-b flex items-center justify-between shrink-0 transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-800/20 border-slate-800' : 'bg-slate-50/50 border-slate-100'}`}>
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 ${receipt.status === 'Failed' ? 'bg-rose-600' : config.theme.color} rounded-xl flex items-center justify-center text-white shadow-md`}>
            {receipt.status === 'Failed' ? <AlertTriangle className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
          </div>
          <div>
            <h2 className={`text-lg font-black tracking-tight flex items-center gap-2 ${config.colorMode === 'Dark' ? 'text-white' : 'text-slate-900'}`}>
              {receipt.merchant_name || receipt.display_filename || receipt.filename || 'Processing receipt'}
              <span className={`px-2 py-0.5 rounded text-[9px] uppercase ${receipt.status === 'Failed' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {labels.confidence}: {((Number(receipt.confidence_score) || 0) * 100).toFixed(0)}%
              </span>
            </h2>
            {receipt.source_page_label && (
              <p className={`text-[10px] font-black uppercase mt-0.5 ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                {receipt.display_filename || receipt.source_page_label}
              </p>
            )}
            <p className={`text-[10px] font-bold uppercase mt-0.5 ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.processingTimeLabel || '处理时间'}: {receipt.time || '10:20'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {receipt.deleted_at ? (
            <>
              <button onClick={onRestore} className="px-4 py-2 rounded-xl bg-emerald-50 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100">{labels.restoreLabel || 'Restore'}</button>
              <button onClick={onPermanentDelete} className="px-4 py-2 rounded-xl bg-rose-50 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-100">{labels.deletePermanentlyLabel || 'Delete permanently'}</button>
            </>
          ) : (
            <>
              <button
                onClick={onSmartParse}
                disabled={isSmartParsing || receipt.status === 'Processing'}
                className={`px-5 py-2.5 border rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-sm disabled:opacity-60 disabled:cursor-wait ${config.colorMode === 'Dark' ? 'bg-indigo-950/60 border-indigo-900 text-indigo-300 hover:bg-indigo-900' : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100'}`}
              >
                <Cpu className={`w-3.5 h-3.5 ${isSmartParsing ? 'animate-pulse' : ''}`} />
                {smartParseLabel}
              </button>
              <button disabled={isExporting} onClick={onExport} className={`px-4 py-2 border rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-sm disabled:cursor-wait disabled:opacity-60 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <FileOutput className="w-3.5 h-3.5" /> {isExporting ? labels.generatingExcelLabel || 'Generating Excel...' : labels.exportSingle}
              </button>
              <button
                onClick={onSync}
                className={`px-5 py-2.5 ${config.theme.color} text-white rounded-xl text-[10px] font-black flex items-center gap-2 transition-all shadow-md hover:brightness-110 active:scale-95`}
              >
                <Save className="w-3.5 h-3.5" /> {labels.syncToSheets}
              </button>
            </>
          )}
          <button onClick={onClose} className={`p-2 border rounded-xl transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-100'}`} title={labels.closeDrawerLabel || 'Close'}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {activeRepairProgress && (
        <div className={`px-8 py-3 border-b transition-colors ${config.colorMode === 'Dark' ? 'bg-indigo-950/30 border-indigo-900/50' : 'bg-indigo-50/80 border-indigo-100'}`}>
          <div className="flex items-center justify-between gap-4">
            <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-wide ${config.colorMode === 'Dark' ? 'text-indigo-200' : 'text-indigo-700'}`}>
              <Cpu className="w-3.5 h-3.5 animate-pulse" />
              <span>{activeRepairProgress.label}</span>
            </div>
            <span className={`text-[10px] font-black tabular-nums ${config.colorMode === 'Dark' ? 'text-indigo-300' : 'text-indigo-700'}`}>
              {activeRepairProgress.percent}%
            </span>
          </div>
          <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${config.colorMode === 'Dark' ? 'bg-slate-800' : 'bg-white'}`}>
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-700 ease-out"
              style={{ width: `${activeRepairProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      <div className={`grid grid-cols-2 gap-3 border-b px-8 py-4 lg:grid-cols-4 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
        <ReviewSummaryChip
          label={labels.statusSummaryLabel || labels.statusAll || 'Status'}
          value={statusLabel}
          tone="neutral"
          colorMode={config.colorMode}
        />
        <ReviewSummaryChip
          label={labels.mathSummaryLabel || labels.calculator || 'Math'}
          value={mathPassed ? labels.mathPassed : `${labels.mathFailed} ${config.currency} ${mathDelta.toFixed(2)}`}
          tone={mathPassed ? 'success' : 'danger'}
          colorMode={config.colorMode}
        />
        <ReviewSummaryChip
          label={labels.warningSummaryLabel || 'Warnings'}
          value={typeof labels.warningCountLabel === 'function' ? labels.warningCountLabel(warningCount) : `${warningCount} warnings`}
          tone={warningCount > 0 ? 'warning' : 'success'}
          colorMode={config.colorMode}
        />
        <ReviewSummaryChip
          label={labels.itemsSummaryLabel || labels.skuItems || 'Items'}
          value={typeof labels.lineItemCountLabel === 'function' ? labels.lineItemCountLabel(itemCount) : `${itemCount} items`}
          tone="neutral"
          colorMode={config.colorMode}
        />
      </div>

      <div className={`grid grid-cols-1 gap-3 border-b px-8 py-4 lg:grid-cols-2 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
        <ProcessingPanel stage={receipt.processing_stage} status={receipt.status} labels={labels} />
        <WarningPanel warnings={receipt.warnings} labels={labels} />
        {receipt.deleted_at && (
          <div className={`rounded-2xl border px-4 py-3 text-xs font-bold ${config.colorMode === 'Dark' ? 'border-rose-900/60 bg-rose-950/20 text-rose-200' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>
            {labels.rejectedReasonLabel || 'Rejected reason'}: {receipt.deleted_reason || 'other'}{receipt.deleted_note ? ` / ${receipt.deleted_note}` : ''} / {receipt.deleted_at.slice(0, 10)}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`w-[25%] p-6 flex flex-col border-r relative transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-100/80 border-slate-200'}`}>
          <h4 className={`text-[11px] font-black uppercase tracking-[2px] flex items-center gap-2 mb-4 ${config.colorMode === 'Dark' ? 'text-slate-600' : 'text-slate-500'}`}>
            <Eye className="w-4 h-4" /> {imagePreviewMode === 'processed' ? labels.processedImgLabel || 'Processed image' : labels.originalImg}
          </h4>
          {receipt.processed_image_url && receipt.original_image_url && (
            <div className={`mb-4 grid grid-cols-2 gap-1 rounded-xl p-1 text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'bg-slate-900' : 'bg-white'}`}>
              <button
                type="button"
                onClick={() => setImagePreviewMode('processed')}
                className={`rounded-lg px-3 py-2 transition ${imagePreviewMode === 'processed' ? `${config.theme.color} text-white` : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {labels.processedImgLabel || 'Processed image'}
              </button>
              <button
                type="button"
                onClick={() => setImagePreviewMode('original')}
                className={`rounded-lg px-3 py-2 transition ${imagePreviewMode === 'original' ? `${config.theme.color} text-white` : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {labels.originalImg}
              </button>
            </div>
          )}
          <div className={`flex-1 rounded-[24px] overflow-hidden border shadow-sm flex items-center justify-center relative group ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            {selectedReceiptImageUrl ? (
              <>
                <img
                  src={selectedReceiptImageUrl}
                  onError={(event: any) => { event.target.onerror = null; event.target.src = '/input_file_2.png' }}
                  alt={imagePreviewMode === 'processed' ? labels.processedImgLabel || 'Processed image' : labels.originalImg}
                  className="w-full h-full object-contain cursor-zoom-in"
                  onClick={() => onZoomImage(selectedReceiptImageUrl)}
                  referrerPolicy="no-referrer"
                />

                <button
                  onClick={() => onZoomImage(selectedReceiptImageUrl)}
                  className="absolute bottom-4 right-4 px-3 py-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 text-[10px] font-black uppercase shadow-xl"
                >
                  <ZoomIn className="w-4 h-4" /> {labels.zoomTip}
                </button>
              </>
            ) : (
              <div className="text-slate-400 text-[10px] font-bold flex flex-col items-center gap-2">
                <Eye className="w-6 h-6 opacity-20" />
                {labels.noImgLabel}
              </div>
            )}
          </div>
          {(receipt.subsidy_info || hasSubsidyDetails(receipt.subsidy_details)) && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className={`text-[9px] font-black uppercase mb-1 ${config.colorMode === 'Dark' ? 'text-amber-500' : 'text-amber-700'}`}>{labels.subsidyInfo}</p>
              <p className={`text-xs font-black leading-tight ${config.colorMode === 'Dark' ? 'text-amber-200' : 'text-amber-900'}`}>{receipt.subsidy_info || formatSubsidyHeadline(receipt.subsidy_details, config.currency)}</p>
              {subsidyRows.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {subsidyRows.slice(0, 6).map((row) => (
                    <div key={row.label} className={`rounded-lg px-2 py-1.5 ${config.colorMode === 'Dark' ? 'bg-slate-950/40' : 'bg-white/70'}`}>
                      <p className="text-[8px] font-black uppercase text-slate-400">{row.label}</p>
                      <p className={`truncate text-[10px] font-black ${config.colorMode === 'Dark' ? 'text-slate-100' : 'text-slate-800'}`}>{row.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {(receipt.raw_ocr || receipt.raw_ai?.parser_note) && (
            <details className={`mt-4 rounded-xl border p-4 text-xs ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-900 text-slate-400' : 'border-slate-200 bg-white text-slate-500'}`}>
              <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500">{labels.ocrRawSummaryLabel || 'OCR text / parser notes'}</summary>
              {receipt.raw_ai?.parser_note && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-bold leading-5 text-amber-700">{receipt.raw_ai.parser_note}</p>
              )}
              {receipt.raw_ocr && (
                <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[10px] leading-5 text-slate-100">{receipt.raw_ocr}</pre>
              )}
            </details>
          )}
        </div>

        <div className={`themed-scrollbar w-[75%] flex flex-col overflow-y-auto ${config.colorMode === 'Dark' ? 'bg-slate-900/50' : 'bg-slate-50/30'}`}>
          <div className={`p-8 border-b space-y-6 transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <section className="space-y-4">
              <h4 className={`text-[11px] font-black ${config.theme.text} uppercase tracking-[2px] flex items-center gap-2`}>
                <Building2 className="w-4 h-4" /> {labels.merchantInfo}
              </h4>
              <div className="grid grid-cols-4 gap-6">
                <div className="col-span-4 lg:col-span-3 grid grid-cols-6 gap-4">
                  <div className={`${isFieldVisible('merchant_name') ? '' : 'hidden'} col-span-6 xl:col-span-4 space-y-1.5`}>
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.merchantLabel}</label>
                    <input type="text" value={receipt.merchant_name || ''} onChange={(event) => updateReceipt({ merchant_name: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'}`} />
                  </div>
                  <div className={`${isFieldVisible('date') ? '' : 'hidden'} col-span-6 sm:col-span-2 xl:col-span-2 space-y-1.5`}>
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.dateLabel}</label>
                    <input type="text" value={receipt.date || ''} onChange={(event) => updateReceipt({ date: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'}`} />
                  </div>
                  <div className={`${isFieldVisible('invoice_no') ? '' : 'hidden'} col-span-6 xl:col-span-2 space-y-1.5`}>
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.invoiceLabel}</label>
                    <input type="text" value={receipt.invoice_no || ''} onChange={(event) => updateReceipt({ invoice_no: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'}`} />
                  </div>
                  <div className={`${isFieldVisible('company_reg_no') ? '' : 'hidden'} col-span-6 xl:col-span-2 space-y-1.5`}>
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.regNoLabel}</label>
                    <input type="text" value={receipt.company_reg_no || ''} onChange={(event) => updateReceipt({ company_reg_no: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'}`} />
                  </div>
                  <div className={`${isFieldVisible('tin_no') ? '' : 'hidden'} col-span-6 xl:col-span-2 space-y-1.5`}>
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.tinLabel || 'TIN 号'}</label>
                    <input type="text" value={receipt.tin_no || ''} onChange={(event) => updateReceipt({ tin_no: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'}`} />
                  </div>
                  <div className={`${isFieldVisible('sst_no') ? '' : 'hidden'} col-span-6 xl:col-span-2 space-y-1.5`}>
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.sstIdLabel || 'SST 编号'}</label>
                    <input type="text" value={receipt.sst_no || ''} onChange={(event) => updateReceipt({ sst_no: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'}`} />
                  </div>
                  <div className="col-span-6 xl:col-span-4 space-y-1.5">
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.phonePaymentLabel}</label>
                    <div className="flex gap-2">
                      <input type="text" value={receipt.phone || ''} placeholder={labels.phonePlaceholder || 'Phone'} onChange={(event) => updateReceipt({ phone: event.target.value })} className={`${isFieldVisible('payment_method') ? 'w-1/2' : 'w-full'} border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'}`} />
                      {isFieldVisible('payment_method') && (
                        <input type="text" value={receipt.payment_method || ''} placeholder={labels.paymentPlaceholder || 'Payment'} onChange={(event) => updateReceipt({ payment_method: event.target.value })} className={`w-1/2 border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'}`} />
                      )}
                    </div>
                  </div>
                </div>

                <div className={`col-span-4 lg:col-span-1 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l pt-4 lg:pt-0 lg:pl-6 ${config.colorMode === 'Dark' ? 'border-slate-800' : 'border-slate-100'}`}>
                  <div className="space-y-1.5">
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.docTypeIndLabel}</label>
                    <div className="flex gap-2">
                      <SoftSelect
                        value={receipt.doc_type || 'Receipt'}
                        options={documentTypeOptions}
                        colorMode={config.colorMode}
                        optionLabels={labels.optionLabels}
                        onChange={(value) => updateReceipt({ doc_type: value })}
                        className="min-w-32 flex-1"
                      />
                      <SoftSelect
                        value={receipt.industry || 'Other'}
                        options={industries}
                        colorMode={config.colorMode}
                        optionLabels={labels.optionLabels}
                        onChange={(value) => updateReceipt({ industry: value })}
                        className="min-w-28 flex-1"
                      />
                    </div>
                  </div>
                  {(receipt.doc_type === 'Custom (自定义)' || receipt.custom_doc_type) && (
                    <CustomDocTypeInput
                      value={customDocTypeInput}
                      onChange={handleCustomDocTypeChange}
                      onSave={handleSaveCustomDocType}
                      placeholder={labels.customDocTypePlaceholder}
                      saveLabel={labels.saveLabel}
                    />
                  )}
                  <div className="space-y-1.5">
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.tagsLabel || labels.quickTagsLabel || '分类标签'}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(new Set([...tagOptions, ...(receipt.tags || [])])).map((tag) => (
                        <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`px-2.5 py-1 rounded-lg text-[9px] font-black transition-all ${receipt.tags?.includes(tag) ? config.theme.color + ' text-white shadow-sm' : config.colorMode === 'Dark' ? 'bg-slate-800 text-slate-500 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                          {labels.optionLabels?.[tag] || tag}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <input type="text" value={newTagInput} onChange={(event) => setNewTagInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handleAddCustomTag(event)} placeholder={labels.customTagPlaceholder} className={`flex-1 border rounded-lg px-2 py-1.5 text-[10px] font-black outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/50' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/20'}`} />
                      <button type="button" onClick={() => handleAddCustomTag()} className={`px-2.5 py-1.5 ${config.theme.color} text-white rounded-lg text-[10px] font-black uppercase hover:brightness-110 transition-all`}>{labels.add}</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className={`${isFieldVisible('items') ? '' : 'hidden'} p-8 flex-1 flex flex-col`}>
            <div className="flex items-center justify-between mb-4">
              <h4 className={`text-[11px] font-black ${config.theme.text} uppercase tracking-[2px] flex items-center gap-2`}>
                <ShoppingCart className="w-4 h-4" /> {labels.skuItems}
              </h4>
              <button type="button" onClick={addNewItem} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 hover:brightness-95 transition-all ${config.colorMode === 'Dark' ? 'bg-indigo-900/30 text-indigo-400' : `${config.theme.light} ${config.theme.text}`}`}>
                <Plus className="w-3.5 h-3.5" /> SKU
              </button>
            </div>
            {hasItemQualityWarning && (
              <div className={`mb-4 rounded-xl border px-4 py-3 text-[10px] font-bold leading-5 ${config.colorMode === 'Dark' ? 'border-amber-800 bg-amber-950/30 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{labels.itemQualityWarningLabel || '商品明细名称质量偏低。请对照左侧图片人工补全，或重新智能解析。'}</span>
                </div>
              </div>
            )}

            <div className={`border rounded-[20px] overflow-hidden shadow-sm flex-1 transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <table className="w-full text-left text-sm">
                <thead className={`text-[9px] font-black uppercase border-b ${config.colorMode === 'Dark' ? 'bg-slate-800/50 text-slate-600 border-slate-800' : 'bg-slate-50/80 text-slate-500 border-slate-100'}`}>
                  <tr>
                    <th className="px-5 py-3">{labels.itemName}</th>
                    <th className="px-3 py-3 w-20 text-center">{labels.qty}</th>
                    <th className="px-3 py-3 w-28 text-right">{labels.unitLabel || 'Unit'} {config.currency}</th>
                    <th className="px-5 py-3 w-28 text-right">{labels.lineLabel || 'Line'} {config.currency}</th>
                    <th className="px-3 py-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${config.colorMode === 'Dark' ? 'divide-slate-800' : 'divide-slate-50'}`}>
                  {(receipt.items || []).map((item: any) => (
                    <tr key={item.id} className="group transition-colors">
                      <td className="px-5 py-2">
                        <input type="text" value={item.name || ''} onChange={(event) => updateItem(item.id, 'name', event.target.value)} placeholder={labels.itemNamePlaceholder || labels.itemName} className={`w-full bg-transparent border-none p-1.5 text-xs font-black focus:ring-1 rounded ${config.colorMode === 'Dark' ? 'text-slate-300 focus:ring-slate-700 focus:bg-slate-800' : 'text-slate-700 focus:ring-slate-200 focus:bg-white'}`} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.001" value={item.qty === 0 ? '' : item.qty} onChange={(event) => updateItem(item.id, 'qty', event.target.value)} className={`w-full bg-transparent border-none p-1.5 text-xs font-black focus:ring-1 rounded text-center ${config.colorMode === 'Dark' ? 'text-slate-400 focus:ring-slate-700 focus:bg-slate-800' : 'text-slate-600 focus:ring-slate-200 focus:bg-white'}`} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="0.01" value={item.unit_price === 0 ? '' : item.unit_price} onChange={(event) => updateItem(item.id, 'unit_price', event.target.value)} onBlur={(event) => updateItem(item.id, 'unit_price', (parseFloat(event.target.value) || 0).toFixed(2))} className={`w-full bg-transparent border-none p-1.5 text-xs font-black focus:ring-1 rounded text-right ${config.colorMode === 'Dark' ? 'text-slate-400 focus:ring-slate-700 focus:bg-slate-800' : 'text-slate-600 focus:ring-slate-200 focus:bg-white'}`} />
                      </td>
                      <td className={`px-5 py-2 text-right text-xs font-black ${config.colorMode === 'Dark' ? 'text-white' : 'text-slate-900'}`}>{(Number(item.line_total) || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => removeItem(item.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title={labels.deleteLabel || 'Delete'}><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                  {(!receipt.items || receipt.items.length === 0) && (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-[10px] font-bold text-slate-400">{labels.noLineItemsLabel || 'No line items. Add one manually.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`p-8 border-t shadow-[0_-10px_30px_rgba(0,0,0,0.02)] z-10 flex flex-col gap-6 transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h4 className={`text-[11px] font-black ${config.theme.text} uppercase tracking-[2px] flex items-center gap-2`}>
              <Calculator className="w-4 h-4" /> {labels.calculator}
            </h4>

            <div className={`grid grid-cols-6 gap-4 text-xs font-bold ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-600'}`}>
              <div className={`${isFieldVisible('subtotal') ? '' : 'hidden'} space-y-1.5`}>
                <span className="block text-[10px] text-slate-400 uppercase">{labels.subtotal}</span>
                <div className={`w-full border border-transparent rounded-lg px-3 py-2.5 text-right font-black transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'}`}>{config.currency} {itemsTotal.toFixed(2)}</div>
              </div>
              <div className={`${isFieldVisible('discount') ? '' : 'hidden'} space-y-1.5`}>
                <span className="block text-[10px] text-rose-500 uppercase">{labels.discount}</span>
                <input type="number" value={receipt.discount === 0 ? '' : receipt.discount} onChange={(event) => updateReceipt({ discount: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right text-rose-600 outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'}`} placeholder="0" />
              </div>
              <div className={`${isFieldVisible('service_charge') ? '' : 'hidden'} space-y-1.5`}>
                <span className="block text-[10px] text-slate-400 uppercase">{labels.serviceCharge}</span>
                <input type="number" value={receipt.service_charge === 0 ? '' : receipt.service_charge} onChange={(event) => updateReceipt({ service_charge: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'}`} placeholder="0" />
              </div>
              <div className={`${isFieldVisible('tax') ? '' : 'hidden'} space-y-1.5`}>
                <span className="block text-[10px] text-slate-400 uppercase">{labels.taxSst}</span>
                <input type="number" value={receipt.tax_sst === 0 ? '' : receipt.tax_sst} onChange={(event) => updateReceipt({ tax_sst: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'}`} placeholder="0" />
              </div>
              <div className={`${isFieldVisible('rounding') ? '' : 'hidden'} space-y-1.5`}>
                <span className="block text-[10px] text-slate-400 uppercase">{labels.rounding}</span>
                <input type="number" value={receipt.rounding === 0 ? '' : receipt.rounding} onChange={(event) => updateReceipt({ rounding: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'}`} placeholder="0" />
              </div>
              <div className={`${isFieldVisible('change') ? '' : 'hidden'} space-y-1.5`}>
                <span className="block text-[10px] text-slate-400 uppercase">{labels.change}</span>
                <input type="number" value={receipt.change === 0 ? '' : receipt.change} onChange={(event) => updateReceipt({ change: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'}`} placeholder="0" />
              </div>
            </div>

            {isFieldVisible('subsidy_details') && subsidyRows.length > 0 && (
              <div className={`rounded-2xl border p-5 ${config.colorMode === 'Dark' ? 'border-amber-900/50 bg-amber-950/20' : 'border-amber-100 bg-amber-50/60'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[2px] ${config.colorMode === 'Dark' ? 'text-amber-400' : 'text-amber-700'}`}>{labels.fuelSubsidyLabel || 'Fuel subsidy / Budi Madani'}</p>
                    <p className={`mt-1 text-xs font-bold ${config.colorMode === 'Dark' ? 'text-amber-100' : 'text-amber-900'}`}>
                      {labels.subsidyMathNoteLabel || 'Receipt grand total is preserved; customer payable is shown separately to avoid treating government subsidy as a normal discount.'}
                    </p>
                  </div>
                  {subsidyPayable !== null && (
                    <div className={`min-w-40 rounded-xl px-4 py-3 text-right ${config.colorMode === 'Dark' ? 'bg-slate-950/50' : 'bg-white'}`}>
                      <p className="text-[9px] font-black uppercase text-slate-400">{labels.actualPayableLabel || 'Payable / OPT'}</p>
                      <p className={`text-2xl font-black ${config.colorMode === 'Dark' ? 'text-white' : 'text-slate-900'}`}>{config.currency} {subsidyPayable.toFixed(2)}</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                  {subsidyRows.map((row) => (
                    <div key={row.label} className={`rounded-xl px-3 py-2 ${config.colorMode === 'Dark' ? 'bg-slate-950/40' : 'bg-white/80'}`}>
                      <p className="text-[9px] font-black uppercase text-slate-400">{row.label}</p>
                      <p className={`mt-0.5 truncate text-xs font-black ${config.colorMode === 'Dark' ? 'text-slate-100' : 'text-slate-800'}`}>{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {receipt.doc_type === 'E-invoice' && receipt.extra_fields && (
              <div className={`rounded-2xl border p-5 ${config.colorMode === 'Dark' ? 'border-indigo-900/50 bg-indigo-950/20' : 'border-indigo-100 bg-indigo-50/60'}`}>
                <p className={`text-[10px] font-black uppercase tracking-[2px] ${config.colorMode === 'Dark' ? 'text-indigo-300' : 'text-indigo-700'}`}>{labels.einvoiceSectionLabel || '电子发票信息'}</p>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    [labels.einvoiceSupplierLabel || 'Supplier', receipt.extra_fields.supplier_name, 'supplier_name'],
                    [labels.einvoiceBuyerLabel || 'Buyer', receipt.extra_fields.buyer_name, 'buyer_name'],
                    [labels.einvoiceSupplierTinLabel || 'Supplier TIN', receipt.extra_fields.supplier_tin, 'supplier_tin'],
                    [labels.einvoiceBuyerTinLabel || 'Buyer TIN', receipt.extra_fields.buyer_tin, 'buyer_tin'],
                    [labels.einvoiceSstNoLabel || 'SST No', receipt.extra_fields.sst_no, 'sst_no'],
                    [labels.einvoiceUuidLabel || 'UUID', receipt.extra_fields.invoice_uuid, 'invoice_uuid'],
                    [labels.einvoiceValidationLabel || 'Validation', receipt.extra_fields.validation_link, 'validation_link'],
                    [labels.einvoiceQrPayloadLabel || 'QR Payload', receipt.extra_fields.qr_payload, 'qr_payload'],
                    [labels.einvoiceTypeLabel || 'Invoice Type', receipt.extra_fields.invoice_type, 'invoice_type'],
                    [labels.einvoiceTaxAmountLabel || 'Tax Amount', receipt.extra_fields.tax_amount, 'tax_amount'],
                  ].filter(([, value, key]) => isFieldVisible(key as FieldKey) && value !== null && value !== undefined && value !== '').map(([label, value]) => (
                    <div key={label as string} className={`rounded-xl px-3 py-2 ${config.colorMode === 'Dark' ? 'bg-slate-950/40' : 'bg-white/80'}`}>
                      <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
                      <p className={`mt-0.5 truncate text-xs font-black ${config.colorMode === 'Dark' ? 'text-slate-100' : 'text-slate-800'}`}>{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={`pt-6 border-t flex items-center justify-between ${config.colorMode === 'Dark' ? 'border-slate-800' : 'border-slate-100'}`}>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-0.5">{labels.calculatedTotal}</p>
                <div className="flex items-center gap-4">
                  <p className={`text-3xl font-black tracking-tight ${mathPassed ? config.theme.text : 'text-rose-600'}`}>
                    {config.currency} {manualTotal.toFixed(2)}
                  </p>
                  {!mathPassed ? (
                    <span className="px-3 py-1.5 bg-rose-50 text-rose-600 text-[10px] font-black uppercase rounded-lg border border-rose-100 flex items-center gap-1 animate-pulse">
                      <AlertTriangle className="w-4 h-4" /> {labels.mathFailed} {config.currency} {mathDelta.toFixed(2)}
                    </span>
                  ) : (
                    <span className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg border flex items-center gap-1 ${config.colorMode === 'Dark' ? 'bg-emerald-950 text-emerald-400 border-emerald-900/50' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                      <CheckCircle className="w-4 h-4" /> {labels.mathPassed}
                    </span>
                  )}
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{labels.ocrTotal}: {config.currency} {grandTotal}</p>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={onClose} className={`px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {labels.keepPending}
                </button>
                <button
                  onClick={onSync}
                  className={`px-8 py-4 ${config.theme.color} text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 active:scale-95`}
                >
                  <Save className="w-4 h-4" /> {labels.syncToSheets}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ReceiptDetailPanel>
  )
}

function ReviewSummaryChip({
  label,
  value,
  tone,
  colorMode,
}: {
  label: string
  value: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  colorMode: string
}) {
  const toneClass = tone === 'success'
    ? colorMode === 'Dark' ? 'border-emerald-900/60 bg-emerald-950/20 text-emerald-300' : 'border-emerald-100 bg-emerald-50 text-emerald-700'
    : tone === 'warning'
      ? colorMode === 'Dark' ? 'border-amber-900/60 bg-amber-950/20 text-amber-300' : 'border-amber-100 bg-amber-50 text-amber-700'
      : tone === 'danger'
        ? colorMode === 'Dark' ? 'border-rose-900/60 bg-rose-950/20 text-rose-300' : 'border-rose-100 bg-rose-50 text-rose-700'
        : colorMode === 'Dark' ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-slate-50 text-slate-700'

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[9px] font-black uppercase tracking-[1.5px] opacity-60">{label}</p>
      <p className="mt-1 truncate text-xs font-black">{value}</p>
    </div>
  )
}

export const ReceiptReviewDrawer = memo(ReceiptReviewDrawerComponent)
