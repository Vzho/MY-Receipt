import { memo, useEffect, useId, useMemo, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
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
import { getFieldConfidence, getFieldConfidenceTone } from '../lib/fieldConfidence'
import { getEInvoiceCompliance } from '../lib/einvoiceCompliance'
import { getNextLineItemFieldIndex, shouldMoveLineItemFieldOnEnter } from '../lib/lineItemKeyboard'
import { parseLineItemsFromClipboard } from '../lib/lineItemPaste'
import { getLineItemConfidence, isLowLineItemConfidence } from '../lib/itemConfidence'
import { isLikelyMalaysiaCompanyRegNo, isValidSstNo, normalizeSstNo } from '../lib/malaysiaTaxIds'
import { findReceiptFieldDetections, toOverlayStyle } from '../lib/ocrDetections'
import { getReviewShortcutAction } from '../lib/reviewNavigation'
import { buildSubsidyRows, formatSubsidyHeadline, getSubsidyPayable, hasSubsidyDetails } from '../lib/subsidyDetails'
import type { FieldKey } from '../types/fieldConfig'
import type { ReceiptFieldChange } from '../types/receipt'
import { CustomDocTypeInput } from './CustomDocTypeInput'
import { FieldConfidenceIndicator } from './FieldConfidenceIndicator'
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
  onSyncAndNext?: () => void
  onSelectAdjacent?: (direction: 1 | -1) => void
  onSaveCustomDocType: (value: string) => void | Promise<void>
  onZoomImage: (url: string) => void
  autocompleteOptions?: {
    merchants: string[]
    items: string[]
  }
  auditChanges?: ReceiptFieldChange[]
  showShortcutHints?: boolean
  onToggleShortcutHints?: (show: boolean) => void
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
  onSyncAndNext,
  onSelectAdjacent,
  onSaveCustomDocType,
  onZoomImage,
  autocompleteOptions = { merchants: [], items: [] },
  auditChanges = [],
  showShortcutHints = true,
  onToggleShortcutHints,
}: ReceiptReviewDrawerProps) {
  const [imagePreviewMode, setImagePreviewMode] = useState<'processed' | 'original'>(receipt.processed_image_url ? 'processed' : 'original')
  const [customDocTypeInput, setCustomDocTypeInput] = useState(receipt.custom_doc_type || '')
  const [newTagInput, setNewTagInput] = useState('')
  const [focusedFieldKey, setFocusedFieldKey] = useState<string | null>(null)
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [quickItemInput, setQuickItemInput] = useState('')
  const merchantAutocompleteId = useId()
  const itemAutocompleteId = useId()

  useEffect(() => {
    setImagePreviewMode(receipt.processed_image_url ? 'processed' : 'original')
  }, [receipt.id, receipt.processed_image_url])

  useEffect(() => {
    setCustomDocTypeInput(receipt.custom_doc_type || '')
  }, [receipt.id, receipt.custom_doc_type])

  useEffect(() => {
    setFocusedFieldKey(null)
    setImageNaturalSize(null)
    setSelectedItemIds([])
    setQuickItemInput('')
  }, [receipt.id, imagePreviewMode])

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
  const receiptCurrency = receipt.currency || config.currency || 'RM'
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

  const subsidyRows = useMemo(() => buildSubsidyRows(receipt.subsidy_details, receiptCurrency), [receipt.subsidy_details, receiptCurrency])
  const subsidyPayable = useMemo(() => getSubsidyPayable(receipt.subsidy_details), [receipt.subsidy_details])
  const hasItemQualityWarning = receipt?.raw_ai?.parser_meta?.item_quality === 'low'
    || /line item names look unreliable/i.test(receipt?.raw_ai?.parser_note || '')
  const hasBlurryImageWarning = Array.isArray(receipt?.warnings)
    && receipt.warnings.some((warning: any) => warning?.code === 'blurry_image')
  const highlightDetections = useMemo(() => (
    focusedFieldKey ? findReceiptFieldDetections(receipt, focusedFieldKey).filter((detection) => detection.box) : []
  ), [focusedFieldKey, receipt])

  const updateReceipt = (patch: Record<string, unknown>) => {
    onReceiptChange({ ...receipt, ...patch })
  }

  const reviewFieldProps = (fieldKey: string) => ({
    'data-review-field': fieldKey,
    onFocus: () => setFocusedFieldKey(fieldKey),
  })

  const confidenceFor = (fieldKey: string) => getFieldConfidence(receipt, fieldKey)
  const confidenceInputClass = (fieldKey: string) => (
    getFieldConfidenceTone(confidenceFor(fieldKey)) === 'low'
      ? 'border-amber-300 bg-amber-50/80 focus:ring-amber-400/30'
      : ''
  )

  const fieldLabel = (label: string, fieldKey: string, className = '') => (
    <div className="flex items-center justify-between gap-2">
      <label className={className}>{label}</label>
      <FieldConfidenceIndicator confidence={confidenceFor(fieldKey)} labels={labels} />
    </div>
  )

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

  const currentItemIds = (receipt.items || []).map((item: any) => String(item.id || '')).filter(Boolean)
  const selectedLineItemCount = selectedItemIds.filter((id) => currentItemIds.includes(id)).length
  const allLineItemsSelected = currentItemIds.length > 0 && selectedLineItemCount === currentItemIds.length

  const toggleLineItemSelection = (itemId: string) => {
    setSelectedItemIds((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId])
  }

  const toggleAllLineItems = () => {
    setSelectedItemIds(allLineItemsSelected ? [] : currentItemIds)
  }

  const removeSelectedItems = () => {
    if (selectedLineItemCount === 0) return
    updateReceipt({ items: (receipt.items || []).filter((item: any) => !selectedItemIds.includes(String(item.id || ''))) })
    setSelectedItemIds([])
  }

  const applyTagToReceiptFromSelection = (tag: string) => {
    if (selectedLineItemCount === 0) return
    const currentTags = receipt.tags || []
    updateReceipt({ tags: currentTags.includes(tag) ? currentTags : [...currentTags, tag] })
  }

  const appendParsedItems = (text: string) => {
    const parsed = parseLineItemsFromClipboard(text)
    if (parsed.length === 0) return false
    const timestamp = Date.now()
    updateReceipt({
      items: [
        ...(receipt.items || []),
        ...parsed.map((item, index) => ({ id: `quick-${timestamp}-${index}`, ...item })),
      ],
    })
    return true
  }

  const handleQuickAddItem = () => {
    const value = quickItemInput.trim()
    if (!value) return
    if (appendParsedItems(value)) {
      setQuickItemInput('')
    }
  }

  const handleItemPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text')
    const parsed = parseLineItemsFromClipboard(pasted)
    const isBatchPaste = pasted.includes('\t') || pasted.includes('\n') || parsed.length > 1
    if (!isBatchPaste || parsed.length === 0) return

    event.preventDefault()
    const timestamp = Date.now()
    const newItems = parsed.map((item, index) => ({
      id: `paste-${timestamp}-${index}`,
      ...item,
    }))
    updateReceipt({ items: [...(receipt.items || []), ...newItems] })
  }

  const handleLineItemKeyDown = (event: KeyboardEvent<HTMLInputElement>, itemIndex: number, field: string) => {
    if (!shouldMoveLineItemFieldOnEnter(event.nativeEvent)) return
    const nextIndex = getNextLineItemFieldIndex(itemIndex, (receipt.items || []).length, event.shiftKey ? -1 : 1)
    if (nextIndex === null) return

    event.preventDefault()
    const container = event.currentTarget.closest('[data-line-items-table]')
    const nextInput = container?.querySelector<HTMLInputElement>(`[data-line-item-field="${field}"][data-line-item-index="${nextIndex}"]`)
    nextInput?.focus()
    nextInput?.select()
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
  const eInvoiceCompliance = useMemo(() => getEInvoiceCompliance(receipt), [receipt])
  const missingEInvoiceLabels = useMemo(
    () => eInvoiceCompliance.missing.map((field) => labels.fieldLabels?.[field] || field),
    [eInvoiceCompliance.missing, labels.fieldLabels],
  )
  const syncBlocked = eInvoiceCompliance.isEInvoice && !eInvoiceCompliance.canSync
  const companyRegInvalid = Boolean(receipt.company_reg_no) && !isLikelyMalaysiaCompanyRegNo(receipt.company_reg_no)
  const sstNoInvalid = Boolean(receipt.sst_no) && !isValidSstNo(receipt.sst_no)
  const taxIdInputClass = (invalid: boolean) => invalid
    ? 'border-amber-300 bg-amber-50 text-amber-900 focus:ring-amber-400/30'
    : config.colorMode === 'Dark'
      ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20'
      : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const isTyping = Boolean(target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable))

    if (event.key === 'Tab') {
      const fields = (Array.from(event.currentTarget.querySelectorAll('[data-review-field]')) as HTMLElement[])
        .filter((node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true')
      if (fields.length > 0) {
        event.preventDefault()
        const currentField = target?.closest<HTMLElement>('[data-review-field]')
        const currentIndex = currentField ? fields.indexOf(currentField) : -1
        const direction = event.shiftKey ? -1 : 1
        const nextIndex = (currentIndex + direction + fields.length) % fields.length
        fields[nextIndex]?.focus()
      }
      return
    }

    const action = getReviewShortcutAction(event, { drawerOpen: true, isTyping })
    if (!action) return
    event.preventDefault()

    if (action === 'toggle_image') {
      setImagePreviewMode((current) => current === 'original' && receipt.processed_image_url ? 'processed' : 'original')
    } else if (action === 'next') {
      onSelectAdjacent?.(1)
    } else if (action === 'previous') {
      onSelectAdjacent?.(-1)
    } else if (action === 'save' && !syncBlocked) {
      onSync()
    } else if (action === 'sync_next' && !syncBlocked) {
      onSyncAndNext?.()
    } else if (action === 'export') {
      onExport()
    }
  }

  return (
    <ReceiptDetailPanel colorMode={config.colorMode} onKeyDown={handlePanelKeyDown}>
      <datalist id={merchantAutocompleteId}>
        {autocompleteOptions.merchants.slice(0, 80).map((merchant) => <option key={merchant} value={merchant} />)}
      </datalist>
      <datalist id={itemAutocompleteId}>
        {autocompleteOptions.items.slice(0, 160).map((item) => <option key={item} value={item} />)}
      </datalist>
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
                disabled={syncBlocked}
                title={syncBlocked ? `${labels.einvoiceSyncBlockedLabel || 'Missing required E-invoice fields'}: ${missingEInvoiceLabels.join(', ')}` : undefined}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black flex items-center gap-2 transition-all ${
                  syncBlocked
                    ? 'cursor-not-allowed bg-slate-300 text-slate-500 shadow-none'
                    : `${config.theme.color} text-white shadow-md hover:brightness-110 active:scale-95`
                }`}
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
          value={mathPassed ? labels.mathPassed : `${labels.mathFailed} ${receiptCurrency} ${mathDelta.toFixed(2)}`}
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

      <div className={`flex flex-wrap items-start gap-2 border-b px-8 py-2.5 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
        <ProcessingPanel stage={receipt.processing_stage} status={receipt.status} compact labels={labels} />
        <WarningPanel warnings={receipt.warnings} compact labels={labels} />
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
          {hasBlurryImageWarning && (
            <div className={`mb-4 rounded-2xl border p-3 text-xs font-bold leading-5 ${config.colorMode === 'Dark' ? 'border-amber-900/60 bg-amber-950/20 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest">{labels.blurryImageBannerTitle || labels.warningLabels?.blurry_image || 'Image may be blurry'}</p>
                  <p className="mt-1">{labels.blurryImageBannerBody || 'Ask for a clearer photo, or continue with manual review.'}</p>
                </div>
              </div>
            </div>
          )}
          <div className={`flex-1 rounded-[24px] overflow-hidden border shadow-sm flex items-center justify-center relative group ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            {selectedReceiptImageUrl ? (
              <div className="relative flex max-h-full max-w-full items-center justify-center">
                <img
                  src={selectedReceiptImageUrl}
                  onError={(event: any) => { event.target.onerror = null; event.target.src = '/input_file_2.png' }}
                  alt={imagePreviewMode === 'processed' ? labels.processedImgLabel || 'Processed image' : labels.originalImg}
                  className="max-h-full max-w-full cursor-zoom-in object-contain"
                  onClick={() => onZoomImage(selectedReceiptImageUrl)}
                  onLoad={(event) => setImageNaturalSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })}
                  referrerPolicy="no-referrer"
                />
                {imageNaturalSize && highlightDetections.map((detection, index) => detection.box && (
                  <span
                    key={`${detection.text}-${index}`}
                    className="pointer-events-none absolute rounded-md border-2 border-rose-500 bg-rose-500/20 shadow-[0_0_0_9999px_rgba(15,23,42,0.05)]"
                    style={toOverlayStyle(detection.box, imageNaturalSize)}
                    title={detection.text}
                  />
                ))}

                <button
                  onClick={() => onZoomImage(selectedReceiptImageUrl)}
                  className="absolute bottom-4 right-4 px-3 py-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all flex items-center gap-2 text-[10px] font-black uppercase shadow-xl"
                >
                  <ZoomIn className="w-4 h-4" /> {labels.zoomTip}
                </button>
              </div>
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
              <p className={`text-xs font-black leading-tight ${config.colorMode === 'Dark' ? 'text-amber-200' : 'text-amber-900'}`}>{receipt.subsidy_info || formatSubsidyHeadline(receipt.subsidy_details, receiptCurrency)}</p>
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
                    {fieldLabel(labels.merchantLabel, 'merchant_name', `text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`)}
                    <input {...reviewFieldProps('merchant_name')} list={merchantAutocompleteId} type="text" value={receipt.merchant_name || ''} onChange={(event) => updateReceipt({ merchant_name: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'} ${confidenceInputClass('merchant_name')}`} />
                  </div>
                  <div className={`${isFieldVisible('date') ? '' : 'hidden'} col-span-6 sm:col-span-2 xl:col-span-2 space-y-1.5`}>
                    {fieldLabel(labels.dateLabel, 'date', `text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`)}
                    <input {...reviewFieldProps('date')} type="text" value={receipt.date || ''} onChange={(event) => updateReceipt({ date: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'} ${confidenceInputClass('date')}`} />
                  </div>
                  <div className={`${isFieldVisible('invoice_no') ? '' : 'hidden'} col-span-6 xl:col-span-2 space-y-1.5`}>
                    {fieldLabel(labels.invoiceLabel, 'invoice_no', `text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`)}
                    <input {...reviewFieldProps('invoice_no')} type="text" value={receipt.invoice_no || ''} onChange={(event) => updateReceipt({ invoice_no: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'} ${confidenceInputClass('invoice_no')}`} />
                  </div>
                  <div className={`${isFieldVisible('company_reg_no') ? '' : 'hidden'} col-span-6 xl:col-span-2 space-y-1.5`}>
                    {fieldLabel(labels.regNoLabel, 'company_reg_no', `text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`)}
                    <input {...reviewFieldProps('company_reg_no')} type="text" value={receipt.company_reg_no || ''} onChange={(event) => updateReceipt({ company_reg_no: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${taxIdInputClass(companyRegInvalid)} ${confidenceInputClass('company_reg_no')}`} />
                    {companyRegInvalid && <p className="text-[9px] font-bold text-amber-600">{labels.companyRegInvalidLabel || 'SSM format looks invalid.'}</p>}
                  </div>
                  <div className={`${isFieldVisible('tin_no') ? '' : 'hidden'} col-span-6 xl:col-span-2 space-y-1.5`}>
                    {fieldLabel(labels.tinLabel || 'TIN 号', 'tin_no', `text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`)}
                    <input {...reviewFieldProps('tin_no')} type="text" value={receipt.tin_no || ''} onChange={(event) => updateReceipt({ tin_no: event.target.value })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'} ${confidenceInputClass('tin_no')}`} />
                  </div>
                  <div className={`${isFieldVisible('sst_no') ? '' : 'hidden'} col-span-6 xl:col-span-2 space-y-1.5`}>
                    {fieldLabel(labels.sstIdLabel || 'SST 编号', 'sst_no', `text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`)}
                    <input {...reviewFieldProps('sst_no')} type="text" value={receipt.sst_no || ''} onChange={(event) => updateReceipt({ sst_no: event.target.value })} onBlur={() => updateReceipt({ sst_no: normalizeSstNo(receipt.sst_no) })} className={`w-full border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${taxIdInputClass(sstNoInvalid)} ${confidenceInputClass('sst_no')}`} />
                    {sstNoInvalid && <p className="text-[9px] font-bold text-amber-600">{labels.sstInvalidLabel || 'SST format should look like A00-0000-00000000.'}</p>}
                  </div>
                  <div className="col-span-6 xl:col-span-4 space-y-1.5">
                    {fieldLabel(labels.phonePaymentLabel, 'payment_method', `text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`)}
                    <div className="flex gap-2">
                      <input {...reviewFieldProps('phone')} type="text" value={receipt.phone || ''} placeholder={labels.phonePlaceholder || 'Phone'} onChange={(event) => updateReceipt({ phone: event.target.value })} className={`${isFieldVisible('payment_method') ? 'w-1/2' : 'w-full'} border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'} ${confidenceInputClass('phone')}`} />
                      {isFieldVisible('payment_method') && (
                        <input {...reviewFieldProps('payment_method')} type="text" value={receipt.payment_method || ''} placeholder={labels.paymentPlaceholder || 'Payment'} onChange={(event) => updateReceipt({ payment_method: event.target.value })} className={`w-1/2 border rounded-xl px-4 py-2.5 text-sm font-black focus:ring-2 outline-none transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-white focus:ring-indigo-500/20' : 'bg-slate-50 border-slate-100 text-slate-800 focus:ring-indigo-500/10'} ${confidenceInputClass('payment_method')}`} />
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
                  <div className={`${isFieldVisible('currency') ? '' : 'hidden'} space-y-1.5`}>
                    <label className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.currencyFieldLabel || labels.currency || 'Currency'}</label>
                    <SoftSelect
                      value={receipt.currency || receiptCurrency || 'RM'}
                      options={['RM', 'SGD', 'USD', 'CNY']}
                      colorMode={config.colorMode}
                      optionLabels={labels.optionLabels}
                      onChange={(value) => updateReceipt({ currency: value })}
                      className="w-full"
                    />
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
                <FieldConfidenceIndicator confidence={confidenceFor('items')} labels={labels} />
              </h4>
              <span className={`text-[10px] font-bold ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                {labels.lineItemPasteHintLabel || 'Paste rows from Excel to append items'}
              </span>
              <button type="button" onClick={addNewItem} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 hover:brightness-95 transition-all ${config.colorMode === 'Dark' ? 'bg-indigo-900/30 text-indigo-400' : `${config.theme.light} ${config.theme.text}`}`}>
                <Plus className="w-3.5 h-3.5" /> SKU
              </button>
            </div>
            {selectedLineItemCount > 0 && (
              <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'}`}>
                <span className={`text-[10px] font-black uppercase tracking-wide ${config.colorMode === 'Dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {typeof labels.selectedLineItemsLabel === 'function' ? labels.selectedLineItemsLabel(selectedLineItemCount) : `${selectedLineItemCount} selected`}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {tagOptions.slice(0, 4).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => applyTagToReceiptFromSelection(tag)}
                      className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase transition ${config.colorMode === 'Dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
                    >
                      {labels.optionLabels?.[tag] || tag}
                    </button>
                  ))}
                  <button type="button" onClick={removeSelectedItems} className="rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-black uppercase text-rose-600 transition hover:bg-rose-100">
                    {labels.bulkDeleteItemsLabel || 'Delete rows'}
                  </button>
                </div>
              </div>
            )}
            {hasItemQualityWarning && (
              <div className={`mb-4 rounded-xl border px-4 py-3 text-[10px] font-bold leading-5 ${config.colorMode === 'Dark' ? 'border-amber-800 bg-amber-950/30 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{labels.itemQualityWarningLabel || '商品明细名称质量偏低。请对照左侧图片人工补全，或重新智能解析。'}</span>
                </div>
              </div>
            )}

            <div data-line-items-table className={`border rounded-[20px] overflow-hidden shadow-sm flex-1 transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
              <table className="w-full text-left text-sm">
                <thead className={`text-[9px] font-black uppercase border-b ${config.colorMode === 'Dark' ? 'bg-slate-800/50 text-slate-600 border-slate-800' : 'bg-slate-50/80 text-slate-500 border-slate-100'}`}>
                  <tr>
                    <th className="px-3 py-3 w-10 text-center">
                      <input type="checkbox" checked={allLineItemsSelected} onChange={toggleAllLineItems} aria-label={labels.selectAllLineItemsLabel || 'Select all line items'} />
                    </th>
                    <th className="px-5 py-3">{labels.itemName}</th>
                    <th className="px-3 py-3 w-20 text-center">{labels.qty}</th>
                    <th className="px-3 py-3 w-28 text-right">{labels.unitLabel || 'Unit'} {receiptCurrency}</th>
                    <th className="px-5 py-3 w-28 text-right">{labels.lineLabel || 'Line'} {receiptCurrency}</th>
                    <th className="px-3 py-3 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${config.colorMode === 'Dark' ? 'divide-slate-800' : 'divide-slate-50'}`}>
                  {(receipt.items || []).map((item: any, itemIndex: number) => {
                    const itemId = String(item.id || '')
                    const lineConfidence = getLineItemConfidence(receipt, itemIndex)
                    const lowLineConfidence = isLowLineItemConfidence(lineConfidence?.confidence)
                    return (
                      <tr key={item.id} className={`group transition-colors ${lowLineConfidence ? config.colorMode === 'Dark' ? 'bg-amber-950/20' : 'bg-amber-50/70' : ''}`}>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={selectedItemIds.includes(itemId)} onChange={() => toggleLineItemSelection(itemId)} aria-label={`${labels.selectLineItemLabel || 'Select line item'} ${itemIndex + 1}`} />
                        </td>
                        <td className="px-5 py-2">
                          <div className="flex items-center gap-2">
                            <input {...reviewFieldProps('items')} list={itemAutocompleteId} data-line-item-field="name" data-line-item-index={itemIndex} type="text" value={item.name || ''} onPaste={handleItemPaste} onKeyDown={(event) => handleLineItemKeyDown(event, itemIndex, 'name')} onChange={(event) => updateItem(item.id, 'name', event.target.value)} placeholder={labels.itemNamePlaceholder || labels.itemName} className={`min-w-0 flex-1 bg-transparent border-none p-1.5 text-xs font-black focus:ring-1 rounded ${config.colorMode === 'Dark' ? 'text-slate-300 focus:ring-slate-700 focus:bg-slate-800' : 'text-slate-700 focus:ring-slate-200 focus:bg-white'} ${confidenceInputClass('items')}`} />
                            {lineConfidence && (
                              <span title={lineConfidence.reason || labels.lineItemConfidenceHint || 'Review against original image'} className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black ${lowLineConfidence ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {Math.round(lineConfidence.confidence * 100)}%
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input data-line-item-field="qty" data-line-item-index={itemIndex} type="number" step="0.001" value={item.qty === 0 ? '' : item.qty} onKeyDown={(event) => handleLineItemKeyDown(event, itemIndex, 'qty')} onChange={(event) => updateItem(item.id, 'qty', event.target.value)} className={`w-full bg-transparent border-none p-1.5 text-xs font-black focus:ring-1 rounded text-center ${config.colorMode === 'Dark' ? 'text-slate-400 focus:ring-slate-700 focus:bg-slate-800' : 'text-slate-600 focus:ring-slate-200 focus:bg-white'}`} />
                        </td>
                        <td className="px-3 py-2">
                          <input data-line-item-field="unit_price" data-line-item-index={itemIndex} type="number" step="0.01" value={item.unit_price === 0 ? '' : item.unit_price} onKeyDown={(event) => handleLineItemKeyDown(event, itemIndex, 'unit_price')} onChange={(event) => updateItem(item.id, 'unit_price', event.target.value)} onBlur={(event) => updateItem(item.id, 'unit_price', (parseFloat(event.target.value) || 0).toFixed(2))} className={`w-full bg-transparent border-none p-1.5 text-xs font-black focus:ring-1 rounded text-right ${config.colorMode === 'Dark' ? 'text-slate-400 focus:ring-slate-700 focus:bg-slate-800' : 'text-slate-600 focus:ring-slate-200 focus:bg-white'}`} />
                        </td>
                        <td className={`px-5 py-2 text-right text-xs font-black ${config.colorMode === 'Dark' ? 'text-white' : 'text-slate-900'}`}>{(Number(item.line_total) || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-center">
                          <button type="button" onClick={() => removeItem(item.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title={labels.deleteLabel || 'Delete'}><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    )
                  })}
                  {(!receipt.items || receipt.items.length === 0) && (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-[10px] font-bold text-slate-400">{labels.noLineItemsLabel || 'No line items. Add one manually.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className={`mt-3 flex items-center gap-2 rounded-2xl border p-2 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-white'}`}>
              <input
                type="text"
                value={quickItemInput}
                onChange={(event) => setQuickItemInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleQuickAddItem()
                  }
                }}
                placeholder={labels.quickAddItemPlaceholder || 'Item name amount, or item qty unit price amount'}
                className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-xs font-black outline-none focus:ring-2 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-900 text-white focus:ring-indigo-500/20' : 'border-slate-100 bg-slate-50 text-slate-700 focus:ring-indigo-500/10'}`}
              />
              <button type="button" onClick={handleQuickAddItem} className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase text-white ${config.theme.color}`}>
                {labels.quickAddItemLabel || 'Add row'}
              </button>
            </div>
          </div>

          <div className={`p-8 border-t shadow-[0_-10px_30px_rgba(0,0,0,0.02)] z-10 flex flex-col gap-6 transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h4 className={`text-[11px] font-black ${config.theme.text} uppercase tracking-[2px] flex items-center gap-2`}>
              <Calculator className="w-4 h-4" /> {labels.calculator}
            </h4>

            <div className={`grid grid-cols-6 gap-4 text-xs font-bold ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-600'}`}>
              <div className={`${isFieldVisible('subtotal') ? '' : 'hidden'} space-y-1.5`}>
                <div className="flex items-center justify-between gap-2"><span className="block text-[10px] text-slate-400 uppercase">{labels.subtotal}</span><FieldConfidenceIndicator confidence={confidenceFor('subtotal')} labels={labels} /></div>
                <div className={`w-full border border-transparent rounded-lg px-3 py-2.5 text-right font-black transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-900'}`}>{receiptCurrency} {itemsTotal.toFixed(2)}</div>
              </div>
              <div className={`${isFieldVisible('discount') ? '' : 'hidden'} space-y-1.5`}>
                <div className="flex items-center justify-between gap-2"><span className="block text-[10px] text-rose-500 uppercase">{labels.discount}</span><FieldConfidenceIndicator confidence={confidenceFor('discount')} labels={labels} /></div>
                <input {...reviewFieldProps('discount')} type="number" value={receipt.discount === 0 ? '' : receipt.discount} onChange={(event) => updateReceipt({ discount: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right text-rose-600 outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'} ${confidenceInputClass('discount')}`} placeholder="0" />
              </div>
              <div className={`${isFieldVisible('service_charge') ? '' : 'hidden'} space-y-1.5`}>
                <div className="flex items-center justify-between gap-2"><span className="block text-[10px] text-slate-400 uppercase">{labels.serviceCharge}</span><FieldConfidenceIndicator confidence={confidenceFor('service_charge')} labels={labels} /></div>
                <input {...reviewFieldProps('service_charge')} type="number" value={receipt.service_charge === 0 ? '' : receipt.service_charge} onChange={(event) => updateReceipt({ service_charge: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'} ${confidenceInputClass('service_charge')}`} placeholder="0" />
              </div>
              <div className={`${isFieldVisible('tax') ? '' : 'hidden'} space-y-1.5`}>
                <div className="flex items-center justify-between gap-2"><span className="block text-[10px] text-slate-400 uppercase">{labels.taxSst}</span><FieldConfidenceIndicator confidence={confidenceFor('tax')} labels={labels} /></div>
                <input {...reviewFieldProps('tax')} type="number" value={receipt.tax_sst === 0 ? '' : receipt.tax_sst} onChange={(event) => updateReceipt({ tax_sst: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'} ${confidenceInputClass('tax')}`} placeholder="0" />
              </div>
              <div className={`${isFieldVisible('rounding') ? '' : 'hidden'} space-y-1.5`}>
                <div className="flex items-center justify-between gap-2"><span className="block text-[10px] text-slate-400 uppercase">{labels.rounding}</span><FieldConfidenceIndicator confidence={confidenceFor('rounding')} labels={labels} /></div>
                <input {...reviewFieldProps('rounding')} type="number" value={receipt.rounding === 0 ? '' : receipt.rounding} onChange={(event) => updateReceipt({ rounding: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'} ${confidenceInputClass('rounding')}`} placeholder="0" />
              </div>
              <div className={`${isFieldVisible('change') ? '' : 'hidden'} space-y-1.5`}>
                <div className="flex items-center justify-between gap-2"><span className="block text-[10px] text-slate-400 uppercase">{labels.change}</span><FieldConfidenceIndicator confidence={confidenceFor('change')} labels={labels} /></div>
                <input {...reviewFieldProps('change')} type="number" value={receipt.change === 0 ? '' : receipt.change} onChange={(event) => updateReceipt({ change: event.target.value })} className={`w-full border rounded-lg px-3 py-2.5 text-right outline-none focus:ring-1 ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100 focus:ring-slate-200'} ${confidenceInputClass('change')}`} placeholder="0" />
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
                      <p className={`text-2xl font-black ${config.colorMode === 'Dark' ? 'text-white' : 'text-slate-900'}`}>{receiptCurrency} {subsidyPayable.toFixed(2)}</p>
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

            {receipt.doc_type === 'E-invoice' && (
              <div className={`rounded-2xl border p-5 ${config.colorMode === 'Dark' ? 'border-indigo-900/50 bg-indigo-950/20' : 'border-indigo-100 bg-indigo-50/60'}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className={`text-[10px] font-black uppercase tracking-[2px] ${config.colorMode === 'Dark' ? 'text-indigo-300' : 'text-indigo-700'}`}>{labels.einvoiceSectionLabel || '电子发票信息'}</p>
                    <p className={`mt-1 text-xs font-bold ${config.colorMode === 'Dark' ? 'text-indigo-100' : 'text-indigo-900'}`}>
                      {eInvoiceCompliance.canSync
                        ? labels.einvoiceComplianceReadyLabel || 'LHDN required fields are complete.'
                        : `${labels.einvoiceComplianceMissingLabel || 'Missing'}: ${missingEInvoiceLabels.join(', ')}`}
                    </p>
                  </div>
                  <div className="min-w-48">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase text-indigo-500">
                      <span>{labels.einvoiceComplianceTitle || 'LHDN compliance'}</span>
                      <span>{eInvoiceCompliance.filled}/{eInvoiceCompliance.total}</span>
                    </div>
                    <div className={`mt-2 h-2 rounded-full overflow-hidden ${config.colorMode === 'Dark' ? 'bg-slate-900' : 'bg-white'}`}>
                      <div
                        className={`h-full rounded-full transition-all ${eInvoiceCompliance.canSync ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${eInvoiceCompliance.percent}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    [labels.einvoiceSupplierLabel || 'Supplier', receipt.extra_fields?.supplier_name, 'supplier_name'],
                    [labels.einvoiceBuyerLabel || 'Buyer', receipt.extra_fields?.buyer_name, 'buyer_name'],
                    [labels.einvoiceSupplierTinLabel || 'Supplier TIN', receipt.extra_fields?.supplier_tin, 'supplier_tin'],
                    [labels.einvoiceBuyerTinLabel || 'Buyer TIN', receipt.extra_fields?.buyer_tin, 'buyer_tin'],
                    [labels.einvoiceSstNoLabel || 'SST No', receipt.extra_fields?.sst_no, 'sst_no'],
                    [labels.einvoiceUuidLabel || 'UUID', receipt.extra_fields?.invoice_uuid, 'invoice_uuid'],
                    [labels.einvoiceValidationLabel || 'Validation', receipt.extra_fields?.validation_link, 'validation_link'],
                    [labels.einvoiceQrPayloadLabel || 'QR Payload', receipt.extra_fields?.qr_payload, 'qr_payload'],
                    [labels.einvoiceTypeLabel || 'Invoice Type', receipt.extra_fields?.invoice_type, 'invoice_type'],
                    [labels.einvoiceTaxAmountLabel || 'Tax Amount', receipt.extra_fields?.tax_amount, 'tax_amount'],
                  ].filter(([, value, key]) => isFieldVisible(key as FieldKey) && value !== null && value !== undefined && value !== '').map(([label, value]) => (
                    <div key={label as string} className={`rounded-xl px-3 py-2 ${config.colorMode === 'Dark' ? 'bg-slate-950/40' : 'bg-white/80'}`}>
                      <p className="text-[9px] font-black uppercase text-slate-400">{label}</p>
                      <p className={`mt-0.5 truncate text-xs font-black ${config.colorMode === 'Dark' ? 'text-slate-100' : 'text-slate-800'}`}>{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <details className={`rounded-2xl border p-4 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-950/30' : 'border-slate-100 bg-slate-50'}`}>
              <summary className={`cursor-pointer text-[10px] font-black uppercase tracking-[2px] ${config.colorMode === 'Dark' ? 'text-slate-300' : 'text-slate-600'}`}>
                {labels.changeHistoryLabel || 'Change history'} ({auditChanges.length})
              </summary>
              <div className="mt-3 max-h-48 overflow-auto space-y-2">
                {auditChanges.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400">{labels.noChangeHistoryLabel || 'No saved field changes yet.'}</p>
                ) : auditChanges.slice(0, 30).map((change) => (
                  <div key={change.id} className={`rounded-xl px-3 py-2 text-xs ${config.colorMode === 'Dark' ? 'bg-slate-900 text-slate-300' : 'bg-white text-slate-600'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black uppercase">{change.field_name}</span>
                      <span className="text-[10px] font-bold text-slate-400">{new Date(change.changed_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 truncate font-bold text-slate-400">{change.action}</p>
                  </div>
                ))}
              </div>
            </details>

            <div className={`pt-6 border-t flex items-center justify-between ${config.colorMode === 'Dark' ? 'border-slate-800' : 'border-slate-100'}`}>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase mb-0.5">{labels.calculatedTotal}</p>
                <div className="flex items-center gap-4">
                  <p className={`text-3xl font-black tracking-tight ${mathPassed ? config.theme.text : 'text-rose-600'}`}>
                    {receiptCurrency} {manualTotal.toFixed(2)}
                  </p>
                  {!mathPassed ? (
                    <span className="px-3 py-1.5 bg-rose-50 text-rose-600 text-[10px] font-black uppercase rounded-lg border border-rose-100 flex items-center gap-1 animate-pulse">
                      <AlertTriangle className="w-4 h-4" /> {labels.mathFailed} {receiptCurrency} {mathDelta.toFixed(2)}
                    </span>
                  ) : (
                    <span className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg border flex items-center gap-1 ${config.colorMode === 'Dark' ? 'bg-emerald-950 text-emerald-400 border-emerald-900/50' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                      <CheckCircle className="w-4 h-4" /> {labels.mathPassed}
                    </span>
                  )}
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{labels.ocrTotal}: {receiptCurrency} {grandTotal}</p>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={onClose} className={`px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all ${config.colorMode === 'Dark' ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  {labels.keepPending}
                </button>
                <button
                  onClick={onSync}
                  disabled={syncBlocked}
                  title={syncBlocked ? `${labels.einvoiceSyncBlockedLabel || 'Missing required E-invoice fields'}: ${missingEInvoiceLabels.join(', ')}` : undefined}
                  className={`px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 ${
                    syncBlocked
                      ? 'cursor-not-allowed bg-slate-200 text-slate-400 shadow-none'
                      : `${config.theme.color} text-white shadow-lg hover:brightness-110 active:scale-95`
                  }`}
                >
                  <Save className="w-4 h-4" /> {labels.syncToSheets}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showShortcutHints && (
        <div className={`absolute bottom-8 right-10 max-w-xs rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md ${
          config.colorMode === 'Dark'
            ? 'border-slate-800 bg-slate-950/80 text-slate-300'
            : 'border-slate-200 bg-white/90 text-slate-500'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[1.5px]">{labels.shortcutHintTitle || 'Review shortcuts'}</p>
              <p className="mt-1 text-[10px] font-bold leading-4">{labels.shortcutHintBody || 'Tab fields / Space image / arrows receipts / S sync / E export / Ctrl+Enter sync and next'}</p>
            </div>
            <button
              type="button"
              onClick={() => onToggleShortcutHints?.(false)}
              className={`rounded-lg p-1 transition ${config.colorMode === 'Dark' ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
              title={labels.hideShortcutHintsLabel || 'Hide shortcuts'}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
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
