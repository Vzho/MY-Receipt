import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ReceiptTable } from '../components/ReceiptTable'

describe('ReceiptTable', () => {
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
        labels={{
          merchantLabel: '商户名称 (Merchant)',
          thumbnailLabel: '发票缩略图',
          financialsLabel: '财务详情',
          tagsLabel: '分类标签',
          auditLabel: '操作',
          retry: '重试',
          noRecords: '没有记录',
          totalItems: '条记录',
        }}
        config={{
          colorMode: 'Light',
          currency: 'RM',
          theme: { color: 'bg-indigo-600' },
        }}
        isSelectableForBulk={() => true}
        onToggleSelectAll={vi.fn()}
        onToggleSelectRow={vi.fn()}
        onOpenReceipt={vi.fn()}
        onOpenThumbnail={vi.fn()}
        onCopyText={vi.fn()}
        onRetry={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(html.indexOf('商户名称 (Merchant)')).toBeLessThan(html.indexOf('发票缩略图'))
    expect(html.indexOf('发票缩略图')).toBeLessThan(html.indexOf('财务详情'))
    expect(html).toContain('src="https://example.test/receipt.jpg"')
    expect(html).toContain('alt="Receipt thumbnail"')
    expect(html).toContain('aria-label="放大发票图片"')
    expect(html).toContain('PDF Page 2 of 3')
  })
})
