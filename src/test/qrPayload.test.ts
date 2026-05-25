import { describe, expect, it } from 'vitest'
import {
  decodeQrPayloadFromImageFile,
  looksLikeEInvoiceQrPayload,
  mergeQrPayloadExtraFields,
  parseMyInvoisQrPayload,
} from '../lib/qrPayload'

describe('qr payload helpers', () => {
  it('detects Malaysian e-invoice-like QR payloads', () => {
    expect(looksLikeEInvoiceQrPayload('https://myinvois.hasil.gov.my/validation/abc')).toBe(true)
    expect(looksLikeEInvoiceQrPayload('Invoice UUID: 123')).toBe(true)
    expect(looksLikeEInvoiceQrPayload('plain loyalty receipt qr')).toBe(false)
    expect(looksLikeEInvoiceQrPayload(null)).toBe(false)
  })

  it('returns null when the browser QR detector is unavailable', async () => {
    const originalDetector = (globalThis as typeof globalThis & { BarcodeDetector?: unknown }).BarcodeDetector

    try {
      delete (globalThis as typeof globalThis & { BarcodeDetector?: unknown }).BarcodeDetector
      const file = new File(['not an image'], 'receipt.txt', { type: 'text/plain' })

      await expect(decodeQrPayloadFromImageFile(file)).resolves.toBeNull()
    } finally {
      if (originalDetector) {
        ;(globalThis as typeof globalThis & { BarcodeDetector?: unknown }).BarcodeDetector = originalDetector
      }
    }
  })

  it('parses MyInvois validation links and query fields', () => {
    const payload = 'https://myinvois.hasil.gov.my/validate?uuid=INV-UUID-1&supplierTin=C123&buyerTin=B456&taxAmount=7.12&total=137.60'

    expect(parseMyInvoisQrPayload(payload)).toMatchObject({
      invoice_uuid: 'INV-UUID-1',
      validation_link: payload,
      supplier_tin: 'C123',
      buyer_tin: 'B456',
      tax_amount: 7.12,
      grand_total: 137.6,
      qr_payload: payload,
    })
  })

  it('parses structured key-value QR payloads and preserves existing fields on merge', () => {
    const payload = 'supplier_tin=C123|buyer_tin=B456|invoice_uuid=UUID-2|tax_amount=3.21'

    expect(parseMyInvoisQrPayload(payload)).toMatchObject({
      supplier_tin: 'C123',
      buyer_tin: 'B456',
      invoice_uuid: 'UUID-2',
      tax_amount: 3.21,
    })

    expect(mergeQrPayloadExtraFields({ supplier_tin: 'EXISTING' }, payload)).toMatchObject({
      supplier_tin: 'EXISTING',
      qr_supplier_tin: 'C123',
      qr_buyer_tin: 'B456',
      qr_invoice_uuid: 'UUID-2',
      qr_tax_amount: 3.21,
      buyer_tin: 'B456',
      invoice_uuid: 'UUID-2',
      qr_payload: payload,
    })
  })
})
