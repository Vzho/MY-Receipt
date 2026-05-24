import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DeleteReceiptDialog } from '../components/DeleteReceiptDialog'

describe('DeleteReceiptDialog', () => {
  it('renders soft-delete reason choices and note copy', () => {
    const html = renderToStaticMarkup(
      <DeleteReceiptDialog
        mode="soft"
        count={1}
        receiptName="Bakery receipt"
        defaultReason="duplicate"
        colorMode="Light"
        labels={{
          deleteDialogTitle: 'Move to Deleted',
          deleteDialogDescription: (name: string) => `Choose why ${name} is being removed.`,
          deleteReasonLabel: 'Delete reason',
          deleteReasonOptions: {
            duplicate: 'Duplicate receipt',
            blurry_image: 'Blurry image',
          },
          deleteNoteLabel: 'Note',
          deleteNotePlaceholder: 'Tell the customer what to resend.',
          confirmDeleteLabel: 'Move to Deleted',
          cancelLabel: 'Cancel',
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(html).toContain('Move to Deleted')
    expect(html).toContain('Choose why Bakery receipt is being removed.')
    expect(html).toContain('Duplicate receipt')
    expect(html).toContain('Tell the customer what to resend.')
  })

  it('renders permanent-delete warning without reason controls', () => {
    const html = renderToStaticMarkup(
      <DeleteReceiptDialog
        mode="permanent"
        count={2}
        colorMode="Light"
        labels={{
          batchPermanentDeleteDialogTitle: (count: number) => `Permanently delete ${count} receipts`,
          batchPermanentDeleteDialogDescription: (count: number) => `${count} receipts will be removed.`,
          permanentDeleteWarningLabel: 'This cannot be undone.',
          confirmPermanentDeleteLabel: 'Permanently delete',
          deleteReasonLabel: 'Delete reason',
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(html).toContain('Permanently delete 2 receipts')
    expect(html).toContain('This cannot be undone.')
    expect(html).not.toContain('Delete reason')
  })
})
