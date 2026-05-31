import { describe, expect, it } from 'vitest'
import {
  buildReceiptImageViewportTransform,
  getReceiptImageViewportBox,
} from '../lib/receiptImageViewport'

describe('receipt image viewport', () => {
  it('focuses smart viewport on the active field when field sources exist', () => {
    const receipt = {
      merchant_name: 'Coffee Shop',
      raw_ai: {
        field_sources: {
          merchant_name: [
            { text: 'Coffee Shop', box: { x: 30, y: 40, width: 180, height: 32 } },
          ],
        },
        ocr_meta: {
          ocr_detections: [
            { text: 'TOTAL RM 56.70', box: { x: 220, y: 720, width: 130, height: 28 } },
          ],
        },
      },
    }

    expect(getReceiptImageViewportBox(receipt, 'smart', 'merchant_name')).toEqual({
      x: 30,
      y: 40,
      width: 180,
      height: 32,
    })
  })

  it('focuses amount viewport on amount-related OCR lines', () => {
    const receipt = {
      raw_ai: {
        ocr_meta: {
          ocr_detections: [
            { text: 'ITEM A', box: { x: 30, y: 260, width: 120, height: 24 } },
            { text: 'Subtotal RM 50.00', box: { x: 180, y: 700, width: 160, height: 24 } },
            { text: 'TOTAL RM 56.70', box: { x: 190, y: 760, width: 150, height: 30 } },
          ],
        },
      },
    }

    expect(getReceiptImageViewportBox(receipt, 'amount')).toEqual({
      x: 180,
      y: 700,
      width: 160,
      height: 90,
    })
  })

  it('returns full transform without zoom for full mode', () => {
    expect(buildReceiptImageViewportTransform(
      { width: 400, height: 800 },
      { width: 300, height: 600 },
      'full',
      { x: 200, y: 700, width: 100, height: 40 },
    )).toMatchObject({
      width: 300,
      height: 600,
      zoom: 1,
      transform: 'translate(0px, 0px) scale(1)',
      focusBox: null,
    })
  })

  it('zooms and pans toward a focus box for smart mode', () => {
    const transform = buildReceiptImageViewportTransform(
      { width: 400, height: 800 },
      { width: 300, height: 300 },
      'smart',
      { x: 180, y: 650, width: 120, height: 45 },
    )

    expect(transform?.zoom).toBeGreaterThan(1)
    expect(transform?.transform).toContain('scale(')
    expect(transform?.focusBox).toEqual(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
    }))
  })
})
