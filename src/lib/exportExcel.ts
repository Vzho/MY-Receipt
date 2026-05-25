import { getExportFieldKeys } from './fieldConfig'
import type { FieldKey, FieldPreference } from '../types/fieldConfig'
import type { Receipt, ReceiptItem } from '../types/receipt'

export interface ReceiptSummaryExportRow {
  receipt_id: string
  filename: string
  currency: string
  merchant_name: string
  company_reg_no: string
  tin_no: string
  invoice_no: string
  date: string
  time: string
  category: string
  doc_type: string
  custom_doc_type: string
  status: string
  processing_stage: string
  tags: string
  subtotal: number
  discount: number
  tax: number
  service_charge: number
  rounding: number
  grand_total: number
  payment_method: string
  change: number
  subsidy_program: string
  government_subsidy: number
  payable_total: number
  item_count: number
  items_summary: string
  warning_count: number
  tax_breakdown: string
  address_structured: string
  supplier_name: string
  buyer_name: string
  supplier_tin: string
  buyer_tin: string
  sst_no: string
  invoice_uuid: string
  validation_link: string
  qr_payload: string
  invoice_type: string
  tax_amount: number
}

export interface ReceiptItemExportRow {
  receipt_id: string
  filename: string
  merchant_name: string
  invoice_no: string
  date: string
  item_name: string
  item_qty: number
  item_unit: string
  item_unit_price: number
  item_line_total: number
}

export interface DownloadReceiptsOptions {
  fieldPreferences?: Partial<FieldPreference>[]
  includeDeleted?: boolean
  currency?: string
}

export interface ExportPreview {
  receiptCount: number
  itemCount: number
  receiptHeaders: string[]
  itemHeaders: string[]
  sampleReceipts: ReceiptSummaryExportRow[]
  sampleItems: ReceiptItemExportRow[]
}

function getSubsidyNumber(details: Record<string, unknown> | null, keys: string[]) {
  if (!details) return 0
  for (const key of keys) {
    const value = details[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/[^\d.-]/g, ''))
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

function getSubsidyText(details: Record<string, unknown> | null, keys: string[]) {
  if (!details) return ''
  for (const key of keys) {
    const value = details[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function flattenReceipts(receipts: Receipt[], options: DownloadReceiptsOptions = {}): ReceiptSummaryExportRow[] {
  return filterExportReceipts(receipts, options).map((receipt) => {
    const items = getReceiptItems(receipt)
    const subsidyDetails = receipt.subsidy_details
    const extraFields = receipt.extra_fields ?? {}

    return {
      receipt_id: receipt.id,
      filename: receipt.filename || '',
      currency: (receipt as Receipt & { currency?: string }).currency || options.currency || 'RM',
      merchant_name: receipt.merchant_name || '',
      company_reg_no: receipt.company_reg_no || '',
      tin_no: stringValue((receipt as Receipt & { tin_no?: unknown }).tin_no) || stringValue(extraFields.tin_no),
      invoice_no: receipt.invoice_no || '',
      date: receipt.date || '',
      time: receipt.time || '',
      category: receipt.category,
      doc_type: receipt.doc_type,
      custom_doc_type: receipt.custom_doc_type || '',
      status: receipt.status,
      processing_stage: receipt.processing_stage || '',
      tags: (receipt.tags || []).join(', '),
      subtotal: Number(receipt.subtotal || 0),
      discount: Number(receipt.discount || 0),
      tax: Number(receipt.tax || 0),
      service_charge: Number(receipt.service_charge || 0),
      rounding: Number(receipt.rounding || 0),
      grand_total: Number(receipt.grand_total || 0),
      payment_method: receipt.payment_method || '',
      change: Number(receipt.change || 0),
      subsidy_program: getSubsidyText(subsidyDetails, ['program', 'scheme', 'name']),
      government_subsidy: getSubsidyNumber(subsidyDetails, ['government_subsidy', 'subsidy_amount']),
      payable_total: getSubsidyNumber(subsidyDetails, ['payable_total', 'paid_total', 'opt', 'outstanding_payment_total']),
      item_count: items.length,
      items_summary: summarizeItems(items),
      warning_count: receipt.warnings?.length ?? 0,
      tax_breakdown: summarizeTaxBreakdown(receipt.tax_breakdown),
      address_structured: summarizeAddressStructured(receipt.address_structured),
      supplier_name: stringValue(extraFields.supplier_name),
      buyer_name: stringValue(extraFields.buyer_name),
      supplier_tin: stringValue(extraFields.supplier_tin),
      buyer_tin: stringValue(extraFields.buyer_tin),
      sst_no: stringValue(extraFields.sst_no),
      invoice_uuid: stringValue(extraFields.invoice_uuid),
      validation_link: stringValue(extraFields.validation_link),
      qr_payload: stringValue(extraFields.qr_payload),
      invoice_type: stringValue(extraFields.invoice_type),
      tax_amount: numberValue(extraFields.tax_amount),
    }
  })
}

export function flattenReceiptItems(receipts: Receipt[], options: DownloadReceiptsOptions = {}): ReceiptItemExportRow[] {
  return filterExportReceipts(receipts, options).flatMap((receipt) => {
    const items = getReceiptItems(receipt)
    if (items.length === 0) return []

    return items.map((item) => ({
      receipt_id: receipt.id,
      filename: receipt.filename || '',
      merchant_name: receipt.merchant_name || '',
      invoice_no: receipt.invoice_no || '',
      date: receipt.date || '',
      item_name: item.name,
      item_qty: Number(item.qty || 0),
      item_unit: item.unit || '',
      item_unit_price: Number(item.unit_price || 0),
      item_line_total: Number(item.line_total || 0),
    }))
  })
}

export async function downloadReceiptsXlsx(receipts: Receipt[], filename = buildExportFilename(), options: DownloadReceiptsOptions = {}) {
  const receiptRows = flattenReceipts(receipts, options)
  const itemRows = flattenReceiptItems(receipts, options)
  const exportFieldKeys = getExportFieldKeys(options.fieldPreferences)
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const receiptsSheet = workbook.addWorksheet('Receipts')
  const itemsSheet = workbook.addWorksheet('Items')

  receiptsSheet.columns = buildReceiptColumns(exportFieldKeys)

  itemsSheet.columns = buildItemColumns(exportFieldKeys)

  receiptRows.forEach((row) => receiptsSheet.addRow(row))
  itemRows.forEach((row) => itemsSheet.addRow(row))
  formatWorksheet(receiptsSheet)
  formatWorksheet(itemsSheet)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function buildExportFilename() {
  const dateStr = new Date().toISOString().replace(/[:\-T]/g, '').slice(0, 14)
  return `ResitAI_Export_${dateStr}.xlsx`
}

function getReceiptItems(receipt: Receipt): ReceiptItem[] {
  return receipt.receipt_items || []
}

function summarizeItems(items: ReceiptItem[]) {
  return items
    .slice(0, 8)
    .map((item) => {
      const qty = Number(item.qty || 0)
      const total = Number(item.line_total || 0)
      const qtyText = qty ? ` x${qty}` : ''
      const totalText = total ? ` RM ${total.toFixed(2)}` : ''
      return `${item.name}${qtyText}${totalText}`.trim()
    })
    .filter(Boolean)
    .join('; ')
}

function formatWorksheet(worksheet: import('exceljs').Worksheet) {
  worksheet.getRow(1).font = { bold: true }
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  }

  const moneyColumns = new Set([
    'subtotal',
    'discount',
    'tax',
    'service_charge',
    'rounding',
    'grand_total',
    'change',
    'government_subsidy',
    'payable_total',
    'tax_amount',
    'item_unit_price',
    'item_line_total',
  ])
  worksheet.columns.forEach((column) => {
    if (column.key && moneyColumns.has(String(column.key))) {
      column.numFmt = '#,##0.00'
    }
  })
}

export function buildExportPreview(receipts: Receipt[], options: DownloadReceiptsOptions = {}): ExportPreview {
  const receiptRows = flattenReceipts(receipts, options)
  const itemRows = flattenReceiptItems(receipts, options)
  const exportFieldKeys = getExportFieldKeys(options.fieldPreferences)

  return {
    receiptCount: receiptRows.length,
    itemCount: itemRows.length,
    receiptHeaders: buildReceiptColumns(exportFieldKeys).map((column) => column.header),
    itemHeaders: buildItemColumns(exportFieldKeys).map((column) => column.header),
    sampleReceipts: receiptRows.slice(0, 3),
    sampleItems: itemRows.slice(0, 3),
  }
}

export function buildReceiptColumns(exportFieldKeys: FieldKey[]) {
  const columns = [
    { header: 'Receipt ID', key: 'receipt_id', width: 38 },
    { header: 'Filename', key: 'filename', width: 32 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Category', key: 'category', width: 14 },
    { header: 'Doc Type', key: 'doc_type', width: 14 },
    { header: 'Custom Doc Type', key: 'custom_doc_type', width: 20 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Processing Stage', key: 'processing_stage', width: 20 },
    { header: 'Tags', key: 'tags', width: 28 },
    { header: 'Warning Count', key: 'warning_count', width: 14 },
    { header: 'Item Count', key: 'item_count', width: 12 },
    { header: 'Items Summary', key: 'items_summary', width: 60 },
  ]

  const fieldColumns: Partial<Record<FieldKey, { header: string; key: keyof ReceiptSummaryExportRow; width: number }>> = {
    merchant_name: { header: 'Merchant', key: 'merchant_name', width: 28 },
    invoice_no: { header: 'Invoice No', key: 'invoice_no', width: 20 },
    date: { header: 'Date', key: 'date', width: 14 },
    time: { header: 'Time', key: 'time', width: 12 },
    subtotal: { header: 'Subtotal', key: 'subtotal', width: 14 },
    discount: { header: 'Discount', key: 'discount', width: 14 },
    tax: { header: 'Tax', key: 'tax', width: 14 },
    service_charge: { header: 'Service Charge', key: 'service_charge', width: 18 },
    rounding: { header: 'Rounding', key: 'rounding', width: 14 },
    grand_total: { header: 'Grand Total', key: 'grand_total', width: 14 },
    payment_method: { header: 'Payment Method', key: 'payment_method', width: 18 },
    change: { header: 'Change', key: 'change', width: 14 },
    tax_breakdown: { header: 'Tax Breakdown', key: 'tax_breakdown', width: 36 },
    company_reg_no: { header: 'Company Reg No', key: 'company_reg_no', width: 18 },
    address_structured: { header: 'Structured Address', key: 'address_structured', width: 42 },
    tin_no: { header: 'TIN No', key: 'tin_no', width: 18 },
    supplier_name: { header: 'Supplier Name', key: 'supplier_name', width: 24 },
    buyer_name: { header: 'Buyer Name', key: 'buyer_name', width: 24 },
    supplier_tin: { header: 'Supplier TIN', key: 'supplier_tin', width: 18 },
    buyer_tin: { header: 'Buyer TIN', key: 'buyer_tin', width: 18 },
    sst_no: { header: 'SST No', key: 'sst_no', width: 18 },
    invoice_uuid: { header: 'Invoice UUID', key: 'invoice_uuid', width: 30 },
    validation_link: { header: 'Validation Link', key: 'validation_link', width: 42 },
    qr_payload: { header: 'QR Payload', key: 'qr_payload', width: 42 },
    invoice_type: { header: 'Invoice Type', key: 'invoice_type', width: 18 },
    tax_amount: { header: 'Tax Amount', key: 'tax_amount', width: 14 },
  }

  return [
    columns[0],
    columns[1],
    ...exportFieldKeys.map((key) => fieldColumns[key]).filter(Boolean),
    ...columns.slice(2),
    { header: 'Subsidy Program', key: 'subsidy_program', width: 24 },
    { header: 'Government Subsidy', key: 'government_subsidy', width: 20 },
    { header: 'Payable Total', key: 'payable_total', width: 16 },
  ]
}

function summarizeTaxBreakdown(value: Receipt['tax_breakdown']) {
  if (!Array.isArray(value) || value.length === 0) return ''
  return value.map((entry) => {
    const parts = [
      entry.tax_type || 'Tax',
      entry.tax_rate !== null && entry.tax_rate !== undefined ? `${entry.tax_rate}%` : '',
      entry.taxable_amount !== null && entry.taxable_amount !== undefined ? `base ${entry.taxable_amount}` : '',
      entry.tax_amount !== null && entry.tax_amount !== undefined ? `tax ${entry.tax_amount}` : '',
    ].filter(Boolean)
    return parts.join(' ')
  }).join('; ')
}

function summarizeAddressStructured(value: Receipt['address_structured']) {
  if (!value || typeof value !== 'object') return ''
  return [
    value.street,
    value.postcode,
    value.city,
    value.state,
    value.country,
  ].filter(Boolean).join(', ')
}

function buildItemColumns(exportFieldKeys: FieldKey[]) {
  if (!exportFieldKeys.includes('items')) return []

  return [
    { header: 'Receipt ID', key: 'receipt_id', width: 38 },
    { header: 'Filename', key: 'filename', width: 32 },
    { header: 'Merchant', key: 'merchant_name', width: 28 },
    { header: 'Invoice No', key: 'invoice_no', width: 20 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Item Name', key: 'item_name', width: 32 },
    { header: 'Qty', key: 'item_qty', width: 10 },
    { header: 'Unit', key: 'item_unit', width: 10 },
    { header: 'Unit Price', key: 'item_unit_price', width: 14 },
    { header: 'Line Total', key: 'item_line_total', width: 14 },
  ]
}

function filterExportReceipts(receipts: Receipt[], options: DownloadReceiptsOptions) {
  return options.includeDeleted ? receipts : receipts.filter((receipt) => !receipt.deleted_at)
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
