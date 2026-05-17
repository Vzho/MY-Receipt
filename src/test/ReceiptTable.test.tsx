import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ReceiptTable } from '../components/ReceiptTable'

describe('ReceiptTable', () => {
  const baseLabels = {
    sequenceLabel: '序号',
    merchantLabel: '商户名称 (Merchant)',
    thumbnailLabel: '发票缩略图',
    financialsLabel: '财务详情',
    tagsLabel: '分类标签',
    auditLabel: '操作',
    retry: '重试',
    noRecords: '没有记录',
    totalItems: '条记录',
    totalLabel: '共',
    prevLabel: '上一页',
    nextLabel: '下一页',
    pageLabel: '第',
    pageOfLabel: '页 / 共',
    pageSuffix: '页',
    skuLabel: '项明细',
    noInvoiceLabel: '无发票号',
    openThumbnailLabel: '放大发票图片',
    copyMerchantLabel: '复制商户名',
    copyInvoiceLabel: '复制发票号',
    readyForCropLabel: '可裁剪并智能解析',
    smartParsingBackgroundLabel: '智能解析后台处理中',
    processingReceiptLabel: '单据处理中',
    deleteLabel: '删除',
    rowNumberLabel: '第 {number} 行',
    optionLabels: {
      Receipt: '收据',
      Invoice: '发票',
      Business: '商务',
      Personal: '个人',
      Pending: '待处理',
    },
  }

  const baseConfig = {
    colorMode: 'Light',
    currency: 'RM',
    theme: { color: 'bg-indigo-600' },
  }

  const baseHandlers = {
    isSelectableForBulk: () => true,
    onToggleSelectAll: vi.fn(),
    onToggleSelectRow: vi.fn(),
    onOpenReceipt: vi.fn(),
    onOpenThumbnail: vi.fn(),
    onCopyText: vi.fn(),
    onRetry: vi.fn(),
    onDelete: vi.fn(),
  }

  it('renders a receipt thumbnail column between merchant and financials', () => {
    const html = renderToStaticMarkup(
      <ReceiptTable
        items={[{
          id: 'receipt-1',
          status: 'Pending',
          merchant_name: 'CRUMBS BAKERY DESSERT SDN. BHD.',
          invoice_no: 'NTCS01-1071769',
          source_page_label: 'PDF Page 2 of 3',
          image_url: 'https://example.test/receipt.jpg',
          original_image_url: 'https://example.test/original.jpg',
          grand_total: 56.7,
          date: '2026-04-19',
          doc_type: 'Receipt',
          tags: ['Ready'],
          items: [],
        }]}
        selectedRowIds={[]}
        labels={baseLabels}
        config={baseConfig}
        {...baseHandlers}
      />,
    )

    expect(html.indexOf('商户名称 (Merchant)')).toBeLessThan(html.indexOf('发票缩略图'))
    expect(html.indexOf('发票缩略图')).toBeLessThan(html.indexOf('财务详情'))
    expect(html).toContain('src="https://example.test/receipt.jpg"')
    expect(html).toContain('alt="发票缩略图"')
    expect(html).toContain('aria-label="放大发票图片"')
    expect(html).toContain('PDF Page 2 of 3')
  })

  it('renders a sequence column between checkbox and merchant', () => {
    const html = renderToStaticMarkup(
      <ReceiptTable
        items={[{
          id: 'receipt-1',
          status: 'Pending',
          merchant_name: 'Merchant 1',
          invoice_no: 'INV-1',
          grand_total: 10,
          date: '2026-04-19',
          doc_type: 'Receipt',
          tags: [],
          items: [],
        }, {
          id: 'receipt-2',
          status: 'Pending',
          merchant_name: 'Merchant 2',
          invoice_no: 'INV-2',
          grand_total: 12,
          date: '2026-04-20',
          doc_type: 'Receipt',
          tags: [],
          items: [],
        }]}
        selectedRowIds={[]}
        labels={baseLabels}
        config={baseConfig}
        {...baseHandlers}
      />,
    )

    expect(html.indexOf('序号')).toBeLessThan(html.indexOf('商户名称 (Merchant)'))
    expect(html).toContain('aria-label="第 1 行"')
    expect(html).toContain('aria-label="第 2 行"')
  })

  it('limits visible receipts by the configured page size', () => {
    const html = renderToStaticMarkup(
      <ReceiptTable
        items={Array.from({ length: 12 }, (_, index) => ({
          id: `receipt-${index}`,
          status: 'Pending',
          merchant_name: `Merchant ${index}`,
          invoice_no: `INV-${index}`,
          grand_total: 10 + index,
          date: '2026-04-19',
          doc_type: 'Receipt',
          tags: [],
          items: [],
        }))}
        pageSize={10}
        selectedRowIds={[]}
        labels={baseLabels}
        config={baseConfig}
        {...baseHandlers}
      />,
    )

    expect(html).toContain('Merchant 0')
    expect(html).toContain('Merchant 9')
    expect(html).not.toContain('Merchant 10')
    expect(html).toContain('第 1 页 / 共 2 页')
    expect(html).toContain('上一页')
    expect(html).toContain('下一页')
  })

  it('renders every selected classification tag without truncating to two', () => {
    const html = renderToStaticMarkup(
      <ReceiptTable
        items={[{
          id: 'receipt-1',
          status: 'Pending',
          merchant_name: 'Merchant',
          invoice_no: 'INV-1',
          grand_total: 10,
          date: '2026-04-19',
          doc_type: 'Invoice',
          tags: ['Pending', 'Personal', 'Business'],
          items: [],
        }]}
        selectedRowIds={[]}
        labels={baseLabels}
        config={baseConfig}
        {...baseHandlers}
      />,
    )

    expect(html).toContain('商务')
    expect(html).toContain('个人')
    expect(html).toContain('待处理')
    expect(html.indexOf('商务')).toBeLessThan(html.indexOf('个人'))
    expect(html.indexOf('个人')).toBeLessThan(html.indexOf('待处理'))
    expect(html).not.toContain('Business')
  })
})
