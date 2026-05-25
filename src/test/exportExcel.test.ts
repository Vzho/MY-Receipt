import { describe, expect, it } from 'vitest'
import { buildExportPreview, buildReceiptColumns, flattenReceiptItems, flattenReceipts } from '../lib/exportExcel'
import type { Receipt } from '../types/receipt'

describe('flattenReceipts', () => {
  it('creates one summary export row per receipt', () => {
    const rows = flattenReceipts([createReceipt()])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      receipt_id: 'receipt-1',
      filename: 'receipt.jpg',
      currency: 'RM',
      merchant_name: 'Test Merchant',
      invoice_no: 'INV-1',
      item_count: 2,
      items_summary: 'Item A x1 RM 10.00; Item B x2 RM 20.00',
    })
  })

  it('exports fuel subsidy fields separately from grand total', () => {
    const rows = flattenReceipts([
      {
        id: 'receipt-fuel',
        user_id: 'user-1',
        filename: 'shell.jpg',
        mime_type: 'image/jpeg',
        file_path: 'user-1/receipt-fuel/original.jpg',
        status: 'pending_review',
        merchant_name: 'APPLE LEAF ENTERPRISE',
        company_reg_no: 'PG0187462-K',
        address: null,
        phone: null,
        invoice_no: 'IRF150NDW',
        date: '2026-04-14',
        time: null,
        category: 'Fuel',
        doc_type: 'Receipt',
        subtotal: 138.01,
        discount: 0,
        tax: 0,
        service_charge: 0,
        rounding: 0,
        grand_total: 138.01,
        payment_method: 'VISA',
        change: 0,
        subsidy_details: {
          program: 'BUDI MADANI RON95',
          government_subsidy: 73.69,
          payable_total: 64.32,
        },
        tags: ['Business'],
        confidence_score: 0.9,
        error_message: null,
        processed_at: null,
        created_at: '2026-05-14T00:00:00Z',
        updated_at: '2026-05-14T00:00:00Z',
        receipt_items: [
          { name: 'FuelSave 95', qty: 32.32, unit: 'L', unit_price: 4.27, line_total: 138.01 },
        ],
      } satisfies Receipt,
    ])

    expect(rows[0]).toMatchObject({
      grand_total: 138.01,
      subsidy_program: 'BUDI MADANI RON95',
      government_subsidy: 73.69,
      payable_total: 64.32,
    })
  })

  it('keeps item detail rows in a separate export shape', () => {
    const rows = flattenReceiptItems([createReceipt()])

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      receipt_id: 'receipt-1',
      merchant_name: 'Test Merchant',
      invoice_no: 'INV-1',
      item_name: 'Item A',
      item_qty: 1,
      item_line_total: 10,
    })
    expect(rows[1]).toMatchObject({
      receipt_id: 'receipt-1',
      item_name: 'Item B',
      item_qty: 2,
      item_line_total: 20,
    })
  })

  it('excludes soft-deleted receipts unless explicitly requested', () => {
    const active = createReceipt({ id: 'active' })
    const deleted = createReceipt({ id: 'deleted', deleted_at: '2026-05-16T00:00:00Z' })

    expect(flattenReceipts([active, deleted]).map((row) => row.receipt_id)).toEqual(['active'])
    expect(flattenReceipts([active, deleted], { includeDeleted: true }).map((row) => row.receipt_id)).toEqual(['active', 'deleted'])
  })

  it('exports e-invoice fields from extra fields', () => {
    const rows = flattenReceipts([
      createReceipt({
        doc_type: 'E-invoice',
        extra_fields: {
          tin_no: 'TIN-GENERIC',
          supplier_name: 'Supplier Sdn Bhd',
          buyer_name: 'Buyer Sdn Bhd',
          supplier_tin: 'TIN-S',
          buyer_tin: 'TIN-B',
          sst_no: 'SST-1',
          invoice_uuid: 'uuid-1',
          validation_link: 'https://example.test/validate',
          qr_payload: 'qr-payload',
          invoice_type: '01',
          tax_amount: 6,
        },
      }),
    ])

    expect(rows[0]).toMatchObject({
      doc_type: 'E-invoice',
      tin_no: 'TIN-GENERIC',
      supplier_name: 'Supplier Sdn Bhd',
      buyer_name: 'Buyer Sdn Bhd',
      supplier_tin: 'TIN-S',
      buyer_tin: 'TIN-B',
      sst_no: 'SST-1',
      invoice_uuid: 'uuid-1',
      validation_link: 'https://example.test/validate',
      qr_payload: 'qr-payload',
      invoice_type: '01',
      tax_amount: 6,
    })
  })

  it('maps configured tin_no to a Receipts sheet column', () => {
    const columns = buildReceiptColumns(['tin_no'])

    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ header: 'TIN No', key: 'tin_no' }),
    ]))
  })

  it('exports configured currency as an explicit receipt column', () => {
    const rows = flattenReceipts([createReceipt()], { currency: 'USD' })
    const columns = buildReceiptColumns([])

    expect(rows[0].currency).toBe('USD')
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ header: 'Currency', key: 'currency' }),
    ]))
  })

  it('keeps receipt currency and structured tax/address fields when present', () => {
    const rows = flattenReceipts([
      createReceipt({
        currency: 'SGD',
        tax_breakdown: [
          { tax_type: 'SST', tax_rate: 8, taxable_amount: 100, tax_amount: 8 },
        ],
        address_structured: {
          street: '1 Jalan Test',
          city: 'Petaling Jaya',
          state: 'Selangor',
          postcode: '46000',
          country: 'Malaysia',
        },
      }),
    ], { currency: 'RM' })
    const columns = buildReceiptColumns(['tax_breakdown', 'address_structured'])

    expect(rows[0]).toMatchObject({
      currency: 'SGD',
      tax_breakdown: 'SST 8% base 100 tax 8',
      address_structured: '1 Jalan Test, 46000, Petaling Jaya, Selangor, Malaysia',
    })
    expect(columns).toEqual(expect.arrayContaining([
      expect.objectContaining({ header: 'Tax Breakdown', key: 'tax_breakdown' }),
      expect.objectContaining({ header: 'Structured Address', key: 'address_structured' }),
    ]))
  })

  it('builds an export preview from the configured receipt and item sheets', () => {
    const preview = buildExportPreview([createReceipt()], {
      currency: 'RM',
      fieldPreferences: [
        { field_key: 'merchant_name', enabled: true, export_enabled: true },
        { field_key: 'items', enabled: true, export_enabled: true },
      ],
    })

    expect(preview.receiptCount).toBe(1)
    expect(preview.itemCount).toBe(2)
    expect(preview.receiptHeaders).toContain('Merchant')
    expect(preview.itemHeaders).toContain('Line Total')
    expect(preview.sampleReceipts[0]).toMatchObject({ merchant_name: 'Test Merchant' })
  })
})

function createReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 'receipt-1',
    user_id: 'user-1',
    filename: 'receipt.jpg',
    mime_type: 'image/jpeg',
    file_path: 'user-1/receipt-1/original.jpg',
    status: 'pending_review',
    merchant_name: 'Test Merchant',
    company_reg_no: null,
    address: null,
    phone: null,
    invoice_no: 'INV-1',
    date: '2026-05-14',
    time: null,
    category: 'Grocery',
    doc_type: 'Receipt',
    subtotal: 30,
    discount: 0,
    tax: 0,
    service_charge: 0,
    rounding: 0,
    grand_total: 30,
    payment_method: null,
    change: 0,
    subsidy_details: null,
    tags: ['Business'],
    confidence_score: 0.9,
    error_message: null,
    processed_at: null,
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
    receipt_items: [
      { name: 'Item A', qty: 1, unit: null, unit_price: 10, line_total: 10 },
      { name: 'Item B', qty: 2, unit: null, unit_price: 10, line_total: 20 },
    ],
    ...overrides,
  }
}
