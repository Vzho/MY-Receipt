import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DeletedReceiptList } from '../components/DeletedReceiptList'
import { DuplicateDialog } from '../components/DuplicateDialog'
import { ReceiptList } from '../components/ReceiptList'

const baseReceipt: any = {
  id: 'receipt-1',
  user_id: 'user-1',
  filename: 'receipt.jpg',
  mime_type: 'image/jpeg',
  file_path: 'receipts/receipt.jpg',
  status: 'pending_review',
  merchant_name: 'Coffee Shop',
  company_reg_no: null,
  address: null,
  phone: null,
  invoice_no: null,
  date: '2026-05-17',
  time: null,
  category: 'F&B',
  doc_type: 'Receipt',
  subtotal: 10,
  discount: 0,
  tax: 0,
  service_charge: 0,
  rounding: 0,
  grand_total: 10,
  payment_method: null,
  change: 0,
  subsidy_details: null,
  tags: [],
  confidence_score: 0.9,
  error_message: null,
  processed_at: null,
  deleted_at: '2026-05-17T10:00:00Z',
  created_at: '2026-05-17T10:00:00Z',
  updated_at: '2026-05-17T10:00:00Z',
}

describe('dialog and deleted receipt i18n', () => {
  it('renders receipt list empty state from labels', () => {
    const html = renderToStaticMarkup(
      <ReceiptList
        receipts={[]}
        labels={{ noRecords: 'No records found' }}
        onOpen={vi.fn()}
      />,
    )

    expect(html).toContain('No records found')
    expect(html).not.toContain('没有记录')
  })

  it('renders duplicate actions from labels', () => {
    const html = renderToStaticMarkup(
      <DuplicateDialog
        filename="new-receipt.jpg"
        candidates={[{ receipt: baseReceipt, score: 0.91, reasons: ['file_hash'] }]}
        labels={{
          duplicateTitle: '可能重复',
          duplicateDescription: (filename: string, score: number) => `${filename} 相似度 ${(score * 100).toFixed(0)}%`,
          noInvoiceLabel: '无发票号',
          cancelUploadLabel: '取消上传',
          openExistingLabel: '打开旧记录',
          continueUploadLabel: '继续上传',
        }}
        onCancel={vi.fn()}
        onContinue={vi.fn()}
        onOpenExisting={vi.fn()}
      />,
    )

    expect(html).toContain('可能重复')
    expect(html).toContain('new-receipt.jpg 相似度 91%')
    expect(html).toContain('无发票号')
    expect(html).toContain('取消上传')
    expect(html).toContain('打开旧记录')
    expect(html).toContain('继续上传')
    expect(html).not.toContain('Possible duplicate')
    expect(html).not.toContain('Cancel upload')
  })

  it('renders deleted receipt actions from labels', () => {
    const html = renderToStaticMarkup(
      <DeletedReceiptList
        receipts={[baseReceipt]}
        labels={{
          noNoteLabel: '无备注',
          copyNoteLabel: '复制重传说明',
          restoreLabel: '恢复',
          deletePermanentlyLabel: '永久删除',
        }}
        onRestore={vi.fn()}
        onPermanentDelete={vi.fn()}
      />,
    )

    expect(html).toContain('无备注')
    expect(html).toContain('复制重传说明')
    expect(html).toContain('恢复')
    expect(html).toContain('永久删除')
    expect(html).not.toContain('No note')
    expect(html).not.toContain('Copy note')
  })
})
