import { describe, expect, it } from 'vitest'
import { canSyncEInvoiceReceipt, getEInvoiceCompliance } from '../lib/einvoiceCompliance'

describe('e-invoice compliance', () => {
  it('does not block ordinary receipts', () => {
    const result = getEInvoiceCompliance({ doc_type: 'Receipt', extra_fields: null })

    expect(result.canSync).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.percent).toBe(100)
  })

  it('requires core LHDN fields before sync', () => {
    const receipt = {
      doc_type: 'E-invoice',
      extra_fields: {
        supplier_tin: 'C123',
        invoice_uuid: 'uuid-1',
        validation_link: 'https://myinvois.hasil.gov.my/uuid-1',
      },
    } as const

    const result = getEInvoiceCompliance(receipt)

    expect(result.canSync).toBe(false)
    expect(result.filled).toBe(3)
    expect(result.missing).toEqual(['buyer_tin', 'tax_amount'])
    expect(canSyncEInvoiceReceipt(receipt)).toBe(false)
  })
})
