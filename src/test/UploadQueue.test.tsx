import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UploadQueue } from '../components/UploadQueue'

describe('UploadQueue', () => {
  it('limits visible queue items and shows progress percentages', () => {
    const html = renderToStaticMarkup(
      <UploadQueue
        items={Array.from({ length: 12 }, (_, index) => ({
          id: `upload-${index}`,
          name: `receipt-${index}.jpg`,
          status: 'OCR parsing in background',
          progress: index + 10,
        }))}
        visibleLimit={10}
        processingLabel="Processing"
        config={{
          colorMode: 'Light',
          theme: {
            color: 'bg-indigo-600',
            light: 'bg-indigo-50',
            text: 'text-indigo-600',
          },
        }}
      />,
    )

    expect(html).toContain('receipt-0.jpg')
    expect(html).toContain('receipt-9.jpg')
    expect(html).not.toContain('receipt-10.jpg')
    expect(html).toContain('10%')
    expect(html).toContain('19%')
    expect(html).toContain('Show 2 more')
  })
})
