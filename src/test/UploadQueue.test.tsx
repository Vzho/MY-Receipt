import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
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
        labels={{
          showMore: (count: number) => `还有 ${count} 个`,
          showLess: '收起',
          statusLabels: {
            'OCR parsing in background': '后台 OCR 解析中',
          },
        }}
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
    expect(html).toContain('后台 OCR 解析中')
    expect(html).toContain('还有 2 个')
    expect(html).not.toContain('Show 2 more')
  })

  it('formats dynamic upload statuses from labels', () => {
    const html = renderToStaticMarkup(
      <UploadQueue
        items={[{
          id: 'pdf-page',
          name: 'invoice.pdf',
          status: 'Uploading PDF page 2 of 5',
          progress: 52,
        }]}
        processingLabel="处理中"
        labels={{
          formatUploadStatus: (status: string) => status.replace('Uploading PDF page 2 of 5', '正在上传 PDF 第 2 / 5 页'),
        }}
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

    expect(html).toContain('正在上传 PDF 第 2 / 5 页')
    expect(html).not.toContain('Uploading PDF page 2 of 5')
  })

  it('shows the batch smart parse action when provided', () => {
    const html = renderToStaticMarkup(
      <UploadQueue
        items={[{ id: 'upload-1', name: 'receipt.jpg', status: 'Uploaded', progress: 100 }]}
        processingLabel="处理中"
        actionLabel="全部智能解析"
        onAction={vi.fn()}
        labels={{}}
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

    expect(html).toContain('全部智能解析')
  })
})
