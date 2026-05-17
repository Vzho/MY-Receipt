import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { getReceiptRotationStyle, nextReceiptRotation, ReceiptCropModal } from '../components/ReceiptCropModal'

describe('ReceiptCropModal', () => {
  it('rotates the receipt photo preview state in ninety degree steps', () => {
    expect(nextReceiptRotation(0, 'left')).toBe(270)
    expect(nextReceiptRotation(0, 'right')).toBe(90)
    expect(nextReceiptRotation(270, 'right')).toBe(0)
    expect(getReceiptRotationStyle(90)).toEqual({
      transform: 'rotate(90deg)',
    })
  })

  it('labels rotation as photo rotation', () => {
    const html = renderToStaticMarkup(
      <ReceiptCropModal
        file={new File(['test'], 'receipt.jpg', { type: 'image/jpeg' })}
        queueCount={1}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(html).toContain('左转照片')
    expect(html).toContain('右转照片')
  })
})
