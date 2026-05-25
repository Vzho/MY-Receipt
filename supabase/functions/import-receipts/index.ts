import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const anonKey = requiredEnv('SUPABASE_ANON_KEY')
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await authClient.auth.getUser()
    if (userError || !user) return json({ error: 'Invalid user session' }, 401)

    const contentType = req.headers.get('content-type') || ''
    const rows = contentType.includes('text/csv')
      ? parseCsv(await req.text())
      : normalizeJsonRows(await req.json())
    if (rows.length === 0) return json({ error: 'No receipt rows provided' }, 400)

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)
    const receipts = rows.map((row) => normalizeReceiptRow(row, user.id))
    const { data, error } = await serviceClient
      .from('receipts')
      .insert(receipts)
      .select('*')

    if (error) throw error
    return json({ inserted: data?.length ?? 0, receipts: data ?? [] })
  } catch (error) {
    console.error('import-receipts failed:', error)
    return json({ error: error instanceof Error ? error.message : 'Import failed' }, 500)
  }
})

function normalizeJsonRows(body: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(body)) return body.filter(isRecord)
  if (isRecord(body) && Array.isArray(body.receipts)) return body.receipts.filter(isRecord)
  return []
}

function parseCsv(text: string): Array<Record<string, unknown>> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((header) => header.trim())
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  })
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && line[index + 1] === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells.map((cell) => cell.trim())
}

function normalizeReceiptRow(row: Record<string, unknown>, userId: string) {
  return {
    user_id: userId,
    filename: stringValue(row.filename) || 'imported-receipt',
    mime_type: null,
    status: 'pending_review',
    processing_stage: 'ready_for_review',
    currency: normalizeCurrency(row.currency),
    merchant_name: stringValue(row.merchant_name ?? row.merchant),
    invoice_no: stringValue(row.invoice_no ?? row.invoice),
    date: normalizeDate(row.date),
    category: normalizeCategory(row.category),
    doc_type: normalizeDocType(row.doc_type),
    subtotal: money(row.subtotal),
    discount: money(row.discount),
    tax: money(row.tax),
    service_charge: money(row.service_charge),
    rounding: money(row.rounding),
    grand_total: money(row.grand_total ?? row.total),
    payment_method: stringValue(row.payment_method),
    change: money(row.change),
    tags: ['Pending'],
    confidence_score: 1,
    warnings: [],
  }
}

function normalizeCurrency(value: unknown) {
  const currency = String(value ?? 'RM').trim().toUpperCase()
  return ['RM', 'SGD', 'USD', 'CNY'].includes(currency) ? currency : 'RM'
}

function normalizeCategory(value: unknown) {
  const category = stringValue(value) || 'Other'
  return ['Grocery', 'Fuel', 'F&B', 'Retail', 'Service', 'Other'].includes(category) ? category : 'Other'
}

function normalizeDocType(value: unknown) {
  const docType = stringValue(value) || 'Receipt'
  return ['Receipt', 'Invoice', 'Credit Note', 'Expense', 'E-invoice'].includes(docType) ? docType : 'Receipt'
}

function normalizeDate(value: unknown) {
  const text = stringValue(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function money(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}
