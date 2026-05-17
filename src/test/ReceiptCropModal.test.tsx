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

  it('renders crop controls from language labels', () => {
    const html = renderToStaticMarkup(
      <ReceiptCropModal
        file={new File(['test'], 'receipt.jpg', { type: 'image/jpeg' })}
        queueCount={2}
        title="Crop before smart parse"
        description="Frame the receipt body before parsing."
        skipLabel="Parse original"
        confirmLabel="Crop and parse"
        labels={{
          queuedCountLabel: (count: number) => `${count} queued`,
          cancelCropLabel: 'Cancel this file',
          dragCropLabel: 'Drag receipt area',
          cropTargetLabel: 'Processing target',
          rotationLabel: (degrees: number) => `Photo rotation: ${degrees} degrees`,
          rotateLeftLabel: 'Rotate photo left',
          rotateRightLabel: 'Rotate photo right',
          resetCropLabel: 'Reset crop box',
          renderingLabel: 'Processing',
          cropPreviewAlt: 'Receipt crop preview',
          resizeCropLabel: (mode: string) => `Resize ${mode}`,
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(html).toContain('Crop before smart parse')
    expect(html).toContain('2 queued')
    expect(html).toContain('Drag receipt area')
    expect(html).toContain('Processing target')
    expect(html).toContain('Photo rotation: 0 degrees')
    expect(html).toContain('Rotate photo left')
    expect(html).toContain('Rotate photo right')
    expect(html).toContain('Reset crop box')
    expect(html).not.toContain('张待处理')
    expect(html).not.toContain('拖动票据区域')
  })
})
