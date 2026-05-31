import { describe, expect, it } from 'vitest'
import { calculateReceiptMath } from '../lib/receiptMath'

describe('calculateReceiptMath', () => {
  it('does not subtract discount when discounted line totals already match the printed subtotal', () => {
    const result = calculateReceiptMath({
      itemTotal: 53.47,
      subtotal: 53.47,
      discount: 2.83,
      tax: 3.21,
      rounding: 0.02,
      grandTotal: 56.7,
    })

    expect(result.discountAlreadyIncluded).toBe(true)
    expect(result.effectiveDiscount).toBe(0)
    expect(result.effectiveRounding).toBe(0.02)
    expect(result.calculatedTotal).toBe(56.7)
  })

  it('subtracts receipt-level discounts when that formula matches the printed grand total', () => {
    const result = calculateReceiptMath({
      itemTotal: 100,
      subtotal: 100,
      discount: 10,
      tax: 5,
      grandTotal: 95,
    })

    expect(result.discountAlreadyIncluded).toBe(false)
    expect(result.effectiveDiscount).toBe(10)
    expect(result.calculatedTotal).toBe(95)
  })

  it('treats positive wipe-off rounding as a deduction when that matches the printed total', () => {
    const result = calculateReceiptMath({
      itemTotal: 118.7,
      hasLineItems: true,
      subtotal: 118.7,
      discount: 0,
      serviceCharge: 11.87,
      tax: 7.12,
      rounding: 0.09,
      grandTotal: 137.6,
    })

    expect(result.effectiveRounding).toBe(-0.09)
    expect(result.calculatedTotal).toBe(137.6)
  })

  it('does not hide zero-value line items by falling back to OCR subtotal', () => {
    const result = calculateReceiptMath({
      itemTotal: 0,
      hasLineItems: true,
      subtotal: 24.89,
      rounding: 0.01,
      grandTotal: 24.9,
    })

    expect(result.baseTotal).toBe(0)
    expect(result.calculatedTotal).toBe(0.01)
  })

  it('uses OCR subtotal only when no line items are available', () => {
    const result = calculateReceiptMath({
      itemTotal: 0,
      hasLineItems: false,
      subtotal: 24.89,
      rounding: 0.01,
      grandTotal: 24.9,
    })

    expect(result.baseTotal).toBe(24.89)
    expect(result.calculatedTotal).toBe(24.9)
  })
})
