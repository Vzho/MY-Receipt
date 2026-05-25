import { describe, expect, it } from 'vitest'
import { normalizeMoney, normalizeReceiptItem, normalizeReceiptPatch } from '../lib/normalizeReceipt'

describe('normalizeMoney', () => {
  it('rounds finite numeric values to 2 decimals', () => {
    expect(normalizeMoney('12.345')).toBe(12.35)
    expect(normalizeMoney(10)).toBe(10)
  })

  it('returns 0 for invalid values', () => {
    expect(normalizeMoney('RM 12')).toBe(0)
    expect(normalizeMoney(null)).toBe(0)
  })
})

describe('normalizeReceiptPatch', () => {
  it('defaults invalid category and doc type', () => {
    const result = normalizeReceiptPatch({ category: 'Food', doc_type: 'Bill' })

    expect(result.category).toBe('Other')
    expect(result.doc_type).toBe('Receipt')
  })

  it('filters unknown tags and clamps confidence', () => {
    const result = normalizeReceiptPatch({ tags: ['Business', 'Unknown'], confidence_score: 2 })

    expect(result.tags).toEqual(['Business'])
    expect(result.confidence_score).toBe(1)
  })

  it('persists top-level tax identifiers through extra_fields', () => {
    const result = normalizeReceiptPatch({ tin_no: 'TIN-1', sst_no: 'A00-1234-00000000' })

    expect(result.extra_fields).toMatchObject({
      tin_no: 'TIN-1',
      sst_no: 'A00-1234-00000000',
    })
  })
})

describe('normalizeReceiptItem', () => {
  it('maps legacy item field to canonical name', () => {
    const result = normalizeReceiptItem({ item: 'Book', qty: '2', unit_price: '3.25' })

    expect(result).toMatchObject({
      name: 'Book',
      qty: 2,
      unit_price: 3.25,
      line_total: 6.5,
    })
  })
})
