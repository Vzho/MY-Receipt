import { describe, expect, it, vi } from 'vitest'
import type { Receipt } from '../types/receipt'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('../lib/supabaseClient', () => ({
  requireSupabase: () => createMockSupabaseClient(),
}))

const insertedReceipt = createReceipt({
  id: 'receipt-1',
  file_path: null,
  status: 'uploaded',
})

const uploadedReceipt = createReceipt({
  id: 'receipt-1',
  file_path: 'user-1/receipt-1/original.jpg',
  status: 'processing',
})

describe('createReceiptFromFile', () => {
  it('accepts PDF receipts so they can be rasterized for OCR', () => {
    const file = new File(['%PDF-1.7'], 'receipt.pdf', { type: 'application/pdf' })

    expect(ACCEPTED_RECEIPT_MIME_TYPES).toContain('application/pdf')
    expect(validateReceiptFile(file)).toBeNull()
  })

  it('can return after upload without waiting for OCR parsing to finish', async () => {
    mocks.invoke.mockReturnValue(new Promise(() => undefined))

    const file = new File(['receipt image'], 'receipt.jpg', { type: 'image/jpeg' })
    const resultPromise = createReceiptFromFile(file, { awaitParse: false })
    const result = await Promise.race([
      resultPromise,
      new Promise<'timed out'>((resolve) => globalThis.setTimeout(() => resolve('timed out'), 20)),
    ])

    expect(result).not.toBe('timed out')
    expect(result).toMatchObject({
      receipt: {
        id: 'receipt-1',
        status: 'processing',
        file_path: 'user-1/receipt-1/original.jpg',
      },
      parseError: null,
    })
    expect(mocks.invoke).toHaveBeenCalledWith('parse-receipt', {
      body: { receipt_id: 'receipt-1' },
    })
  })
})

function createMockSupabaseClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
      })),
    },
    functions: {
      invoke: mocks.invoke,
    },
    from: vi.fn((table: string) => {
      if (table !== 'receipts') throw new Error(`Unexpected table: ${table}`)

      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: insertedReceipt, error: null }),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: uploadedReceipt, error: null }),
            })),
          })),
        })),
      }
    }),
  }
}

function createReceipt(overrides: Partial<Receipt>): Receipt {
  return {
    id: 'receipt-1',
    user_id: 'user-1',
    filename: 'receipt.jpg',
    mime_type: 'image/jpeg',
    file_path: null,
    processed_file_path: null,
    image_processing: null,
    status: 'uploaded',
    merchant_name: null,
    company_reg_no: null,
    address: null,
    phone: null,
    invoice_no: null,
    date: null,
    time: null,
    category: 'Other',
    doc_type: 'Receipt',
    subtotal: 0,
    discount: 0,
    tax: 0,
    service_charge: 0,
    rounding: 0,
    grand_total: 0,
    payment_method: null,
    change: 0,
    subsidy_details: null,
    tags: ['Pending'],
    confidence_score: 0,
    error_message: null,
    processed_at: null,
    created_at: '2026-05-15T00:00:00Z',
    updated_at: '2026-05-15T00:00:00Z',
    ...overrides,
  }
}

const { ACCEPTED_RECEIPT_MIME_TYPES, createReceiptFromFile, validateReceiptFile } = await import('../lib/receiptApi')
