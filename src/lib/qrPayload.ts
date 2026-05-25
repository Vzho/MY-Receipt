export interface ParsedEInvoiceQrFields {
  supplier_tin?: string
  buyer_tin?: string
  invoice_uuid?: string
  validation_link?: string
  qr_payload?: string
  invoice_type?: string
  tax_amount?: number
  grand_total?: number
}

export async function decodeQrPayloadFromImageFile(file: File): Promise<string | null> {
  const BarcodeDetectorConstructor = (globalThis as typeof globalThis & {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: unknown) => Promise<Array<{ rawValue?: string }>>
    }
  }).BarcodeDetector

  if (!BarcodeDetectorConstructor || !globalThis.createImageBitmap) return null

  let image: ImageBitmap | null = null
  try {
    image = await createImageBitmap(file)
    const detector = new BarcodeDetectorConstructor({ formats: ['qr_code'] })
    const results = await detector.detect(image)
    return results.map((result) => result.rawValue?.trim()).find(Boolean) ?? null
  } catch (error) {
    console.warn('QR payload decode skipped:', error)
    return null
  } finally {
    image?.close()
  }
}

export function looksLikeEInvoiceQrPayload(payload: string | null | undefined): boolean {
  if (!payload) return false
  const parsed = parseMyInvoisQrPayload(payload)
  return Boolean(
    parsed.invoice_uuid
    || parsed.supplier_tin
    || parsed.buyer_tin
    || parsed.validation_link
    || /myinvois|e-?invoice|invoice|lhdn|hasil|tax|uuid|validation/i.test(payload),
  )
}

export function parseMyInvoisQrPayload(payload: string | null | undefined): ParsedEInvoiceQrFields {
  const trimmed = payload?.trim()
  if (!trimmed) return {}

  const fields: ParsedEInvoiceQrFields = { qr_payload: trimmed }

  mergeParsedValues(fields, parseJsonPayload(trimmed))
  mergeParsedValues(fields, parseUrlPayload(trimmed))
  mergeParsedValues(fields, parseKeyValuePayload(trimmed))

  return fields
}

export function mergeQrPayloadExtraFields(
  existing: Record<string, unknown> | null | undefined,
  payload: string | null | undefined,
) {
  const parsed = parseMyInvoisQrPayload(payload)
  const current = existing && typeof existing === 'object' ? existing : {}
  const { grand_total: qrGrandTotal, ...parsedExtraFields } = parsed

  return {
    ...parsedExtraFields,
    ...(qrGrandTotal !== undefined ? { qr_grand_total: qrGrandTotal } : {}),
    ...current,
    qr_payload: stringValue(current.qr_payload) || parsed.qr_payload || payload || null,
  }
}

function parseJsonPayload(payload: string) {
  if (!payload.startsWith('{')) return {}
  try {
    const json = JSON.parse(payload)
    return json && typeof json === 'object' ? mapRawFields(json as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function parseUrlPayload(payload: string) {
  try {
    const url = new URL(payload)
    const values: Record<string, unknown> = {}
    url.searchParams.forEach((value, key) => {
      values[key] = value
    })

    if (/myinvois|hasil|lhdn/i.test(url.hostname)) {
      values.validation_link = payload
      const lastPathPart = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
      if (lastPathPart && !values.uuid && /[a-z0-9-]{8,}/i.test(lastPathPart)) {
        values.uuid = lastPathPart
      }
    }

    return mapRawFields(values)
  } catch {
    return {}
  }
}

function parseKeyValuePayload(payload: string) {
  const values: Record<string, unknown> = {}
  const parts = payload.split(/[|&;\n]/).map((part) => part.trim()).filter(Boolean)
  for (const part of parts) {
    const match = part.match(/^([^:=]+)\s*[:=]\s*(.+)$/)
    if (!match) continue
    values[match[1].trim()] = match[2].trim()
  }
  return mapRawFields(values)
}

function mapRawFields(input: Record<string, unknown>): ParsedEInvoiceQrFields {
  const result: ParsedEInvoiceQrFields = {}

  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = normalizeKey(rawKey)
    const value = stringValue(rawValue)
    if (!value) continue

    if (['uuid', 'invoice_uuid', 'invoiceuuid', 'invoice_id', 'invoiceid', 'document_uuid', 'documentuuid', 'document_id', 'documentid'].includes(key)) {
      result.invoice_uuid = value
    } else if (['suppliertin', 'supplier_tin', 'sellertin', 'issuertin', 'tin_supplier'].includes(key)) {
      result.supplier_tin = value
    } else if (['buyertin', 'buyer_tin', 'customertin', 'recipienttin', 'tin_buyer'].includes(key)) {
      result.buyer_tin = value
    } else if (['validation_link', 'validationlink', 'validation_url', 'validationurl', 'verify_url', 'verifyurl', 'url'].includes(key)) {
      result.validation_link = value
    } else if (['invoice_type', 'invoicetype', 'type', 'doc_type', 'doctype', 'document_type', 'documenttype'].includes(key)) {
      result.invoice_type = value
    } else if (['tax_amount', 'taxamount', 'tax', 'sst_amount', 'sstamount', 'tax_total', 'taxtotal'].includes(key)) {
      result.tax_amount = numberValue(value)
    } else if (['grand_total', 'grandtotal', 'total', 'total_amount', 'totalamount', 'amount_payable', 'amountpayable', 'payable_amount', 'payableamount'].includes(key)) {
      result.grand_total = numberValue(value)
    }
  }

  return result
}

function mergeParsedValues(target: ParsedEInvoiceQrFields, source: ParsedEInvoiceQrFields) {
  for (const [key, value] of Object.entries(source) as Array<[keyof ParsedEInvoiceQrFields, string | number | undefined]>) {
    if (value !== undefined && value !== null && target[key] === undefined) {
      ;(target as Record<string, unknown>)[key] = value
    }
  }
}

function normalizeKey(key: string) {
  return key.trim().replace(/[\s-]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

function numberValue(value: string) {
  const parsed = Number(value.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}
