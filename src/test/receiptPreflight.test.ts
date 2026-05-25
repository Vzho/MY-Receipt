import { describe, expect, it } from 'vitest'
import { getReceiptPreflightResult } from '../lib/receiptPreflight'

describe('receipt upload preflight', () => {
  it('does not block normal receipt-looking files', () => {
    expect(getReceiptPreflightResult({
      name: 'receipt-2026-05-25.jpg',
      type: 'image/jpeg',
      size: 400_000,
      width: 1280,
      height: 1800,
    })).toEqual({ shouldConfirm: false, reasons: [] })
  })

  it('asks for confirmation for obvious non-receipt filenames', () => {
    expect(getReceiptPreflightResult({
      name: 'selfie-profile.jpg',
      type: 'image/jpeg',
      size: 400_000,
      width: 1280,
      height: 1800,
    })).toMatchObject({
      shouldConfirm: true,
      reasons: ['filename_non_receipt'],
    })
  })

  it('asks for confirmation for very small images', () => {
    const result = getReceiptPreflightResult({
      name: 'upload.png',
      type: 'image/png',
      size: 12_000,
      width: 260,
      height: 300,
    })

    expect(result.shouldConfirm).toBe(true)
    expect(result.reasons).toContain('file_too_small')
    expect(result.reasons).toContain('image_too_small')
  })

  it('does not warn for PDF files because they are handled by PDF preprocessing', () => {
    expect(getReceiptPreflightResult({
      name: 'invoice.pdf',
      type: 'application/pdf',
      size: 20_000,
      width: 100,
      height: 100,
    })).toEqual({ shouldConfirm: false, reasons: [] })
  })
})
