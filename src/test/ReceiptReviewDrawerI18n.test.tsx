import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ReceiptReviewDrawer } from '../components/ReceiptReviewDrawer'

const baseConfig = {
  colorMode: 'Light',
  currency: 'RM',
  theme: {
    color: 'bg-indigo-600',
    text: 'text-indigo-600',
    light: 'bg-indigo-50',
  },
}

const labels: Record<string, any> = {
  confidence: '置信度',
  processingTimeLabel: '处理时间',
  restoreLabel: '恢复',
  deletePermanentlyLabel: '永久删除',
  smartParseLabel: '智能解析',
  smartParsingLabel: '智能解析中',
  generatingExcelLabel: '正在生成 Excel...',
  exportSingle: '导出当前单据',
  closeDrawerLabel: '关闭编辑页',
  merchantInfo: '商户信息',
  merchantLabel: '商户名称',
  dateLabel: '日期',
  invoiceLabel: '发票号',
  regNoLabel: '注册号',
  tinLabel: 'TIN 号',
  sstIdLabel: 'SST 编号',
  phonePaymentLabel: '电话与支付',
  phonePlaceholder: '电话',
  paymentPlaceholder: '支付方式',
  docTypeIndLabel: '单据类型 & 行业',
  tagsLabel: '分类标签',
  customTagPlaceholder: '+ 自定义标签',
  add: '添加',
  originalImg: '单据原图',
  processedImgLabel: '识别图',
  imageViewportSmartLabel: '智能',
  imageViewportAmountLabel: '金额',
  imageViewportFullLabel: '完整',
  zoomTip: '详情预览',
  noImgLabel: '暂无原图记录',
  skuItems: '明细列表',
  itemQualityWarningLabel: '商品明细名称质量偏低。请对照左侧图片人工补全，或重新智能解析。',
  blurryImageBannerTitle: '图片可能模糊',
  blurryImageBannerBody: '建议重新拍摄清晰照片。',
  itemName: '商品描述',
  qty: '数量',
  unitLabel: '单价',
  lineLabel: '行金额',
  itemNamePlaceholder: '名称',
  noLineItemsLabel: '暂无明细记录，请手动添加。',
  calculator: '计算引擎',
  subtotal: '小计',
  discount: '折扣',
  serviceCharge: '服务费',
  taxSst: '税费',
  rounding: '舍入',
  change: '找零',
  calculatedTotal: '计算所得总计',
  mathPassed: '数学校验通过',
  mathFailed: '数学校验差异',
  ocrTotal: '票面识别总额',
  keepPending: '保持挂起',
  syncToSheets: '同步至云端',
  deleteLabel: '删除',
  statusSummaryLabel: '状态',
  mathSummaryLabel: '数学校验',
  warningSummaryLabel: '提醒',
  itemsSummaryLabel: '明细',
  companyRegInvalidLabel: 'SSM 注册号格式可能不正确。',
  sstInvalidLabel: 'SST 编号格式应类似 A00-0000-00000000。',
  fieldConfidenceLabel: '字段置信度',
  fieldConfidenceHint: '低置信度字段请核对。',
  shortcutHintTitle: '快捷校对',
  shortcutHintBody: 'Tab 切字段 / S 同步',
  hideShortcutHintsLabel: '隐藏快捷键提示',
  selectedLineItemsLabel: (count: number) => `已选择 ${count} 条明细`,
  bulkDeleteItemsLabel: '批量删除',
  selectAllLineItemsLabel: '选择全部明细',
  selectLineItemLabel: '选择明细',
  quickAddItemPlaceholder: '输入名称和金额',
  quickAddItemLabel: '添加明细',
  lineItemConfidenceHint: '建议核对原图',
  warningCountLabel: (count: number) => `${count} 条提醒`,
  lineItemCountLabel: (count: number) => `${count} 条明细`,
  customDocTypePlaceholder: '自定义单据类型',
  saveLabel: '保存',
  einvoiceSectionLabel: '电子发票信息',
  einvoiceSupplierLabel: '供应商',
  einvoiceBuyerLabel: '买方',
  einvoiceSupplierTinLabel: '供应商 TIN',
  einvoiceBuyerTinLabel: '买方 TIN',
  einvoiceSstNoLabel: 'SST 编号',
  einvoiceUuidLabel: '发票 UUID',
  einvoiceValidationLabel: '验证链接',
  einvoiceQrPayloadLabel: '二维码内容',
  einvoiceTypeLabel: '发票类型',
  einvoiceTaxAmountLabel: '税额',
  optionLabels: {
    'E-invoice': '电子发票',
    'F&B': '餐饮',
    Business: '商务',
  },
}

describe('ReceiptReviewDrawer i18n labels', () => {
  it('uses localized labels for tax identifiers and E-invoice section', () => {
    const html = renderToStaticMarkup(
      <ReceiptReviewDrawer
        receipt={{
          id: 'receipt-1',
          status: 'Pending',
          merchant_name: '咖啡店',
          invoice_no: 'INV-001',
          date: '2026-05-18',
          time: '10:20',
          company_reg_no: '198901002708',
          tin_no: 'TIN-1',
          sst_no: 'A00-1234-00000000',
          phone: '012',
          payment_method: 'Cash',
          doc_type: 'E-invoice',
          industry: 'F&B',
          tags: ['Business'],
          items: [],
          subtotal: 0,
          discount: 0,
          service_charge: 0,
          tax_sst: 0,
          rounding: 0,
          change: 0,
          grand_total: 0,
          confidence_score: 0.9,
          warnings: [],
          raw_ai: {
            field_confidence: { merchant_name: 0.58 },
            parser_meta: { item_quality: 'low' },
          },
          extra_fields: {
            supplier_name: '供应商 A',
            buyer_name: '买方 B',
            supplier_tin: 'SUP-TIN',
            buyer_tin: 'BUY-TIN',
            sst_no: 'A00-1234-00000000',
            invoice_uuid: 'UUID-1',
            validation_link: 'https://example.test',
            qr_payload: 'payload',
            invoice_type: '01',
            tax_amount: 0,
          },
        }}
        config={baseConfig}
        labels={labels}
        documentTypeOptions={['Receipt', 'E-invoice']}
        industries={['F&B']}
        tagOptions={['Business']}
        activeRepairProgress={null}
        isExporting={false}
        isSmartParsing={false}
        isFieldVisible={() => true}
        onReceiptChange={vi.fn()}
        onClose={vi.fn()}
        onSmartParse={vi.fn()}
        onExport={vi.fn()}
        onRestore={vi.fn()}
        onPermanentDelete={vi.fn()}
        onSync={vi.fn()}
        onSaveCustomDocType={vi.fn()}
        onZoomImage={vi.fn()}
      />,
    )

    expect(html).toContain('TIN 号')
    expect(html).toContain('SST 编号')
    expect(html).toContain('电子发票信息')
    expect(html).toContain('商品明细名称质量偏低')
    expect(html).not.toContain('图片可能模糊')
    expect(html).not.toContain('建议重新拍摄清晰照片')
    expect(html).toContain('智能')
    expect(html).toContain('金额')
    expect(html).toContain('完整')
    expect(html).toContain('状态')
    expect(html).toContain('0 条提醒')
    expect(html).toContain('0 条明细')
    expect(html).not.toContain('置信度')
    expect(html).not.toContain('58%')
    expect(html).toContain('快捷校对')
    expect(html).not.toContain('TIN No')
    expect(html).not.toContain('Line item names look unreliable')
  })

  it('shows blurry image banner only for image blur evidence', () => {
    const html = renderToStaticMarkup(
      <ReceiptReviewDrawer
        receipt={{
          id: 'receipt-blur',
          status: 'Pending',
          merchant_name: '咖啡店',
          invoice_no: 'INV-BLUR',
          date: '2026-05-18',
          time: '10:20',
          company_reg_no: null,
          phone: '',
          payment_method: '',
          doc_type: 'Receipt',
          industry: 'F&B',
          tags: ['Business'],
          items: [],
          subtotal: 0,
          discount: 0,
          service_charge: 0,
          tax_sst: 0,
          rounding: 0,
          change: 0,
          grand_total: 0,
          image_processing: { quality: 'blurred' },
          warnings: [{ code: 'blurry_image', severity: 'warning', message: 'Receipt image appears blurry' }],
        }}
        config={baseConfig}
        labels={labels}
        documentTypeOptions={['Receipt']}
        industries={['F&B']}
        tagOptions={['Business']}
        activeRepairProgress={null}
        isExporting={false}
        isSmartParsing={false}
        isFieldVisible={() => true}
        onReceiptChange={vi.fn()}
        onClose={vi.fn()}
        onSmartParse={vi.fn()}
        onExport={vi.fn()}
        onRestore={vi.fn()}
        onPermanentDelete={vi.fn()}
        onSync={vi.fn()}
        onSaveCustomDocType={vi.fn()}
        onZoomImage={vi.fn()}
      />,
    )

    expect(html).toContain('图片可能模糊')
    expect(html).toContain('建议重新拍摄清晰照片')
    expect(html).toContain('1 条提醒')
  })

  it('renders quick add and autocomplete hooks without line item confidence badges', () => {
    const html = renderToStaticMarkup(
      <ReceiptReviewDrawer
        receipt={{
          id: 'receipt-2',
          status: 'Pending',
          merchant_name: '咖啡店',
          invoice_no: 'INV-002',
          date: '2026-05-18',
          time: '10:20',
          company_reg_no: null,
          phone: '',
          payment_method: '',
          doc_type: 'Receipt',
          industry: 'F&B',
          tags: ['Business'],
          items: [{ id: 'item-1', name: 'Nasi Lemak', qty: 1, unit_price: 5, line_total: 5 }],
          subtotal: 5,
          discount: 0,
          service_charge: 0,
          tax_sst: 0,
          rounding: 0,
          change: 0,
          grand_total: 5,
          confidence_score: 0.9,
          raw_ai: {
            item_confidence: [{ index: 0, confidence: 0.42, reason: '文本较淡' }],
          },
        }}
        config={baseConfig}
        labels={labels}
        documentTypeOptions={['Receipt']}
        industries={['F&B']}
        tagOptions={['Business', 'Personal']}
        activeRepairProgress={null}
        isExporting={false}
        isSmartParsing={false}
        isFieldVisible={() => true}
        onReceiptChange={vi.fn()}
        onClose={vi.fn()}
        onSmartParse={vi.fn()}
        onExport={vi.fn()}
        onRestore={vi.fn()}
        onPermanentDelete={vi.fn()}
        onSync={vi.fn()}
        onSaveCustomDocType={vi.fn()}
        onZoomImage={vi.fn()}
        autocompleteOptions={{ merchants: ['咖啡店'], items: ['Nasi Lemak'] }}
        showShortcutHints
        onToggleShortcutHints={vi.fn()}
      />,
    )

    expect(html).not.toContain('42%')
    expect(html).toContain('输入名称和金额')
    expect(html).toContain('添加明细')
    expect(html).toContain('Nasi Lemak')
    expect(html).toContain('选择全部明细')
    expect(html).toContain('隐藏快捷键提示')
  })
})
