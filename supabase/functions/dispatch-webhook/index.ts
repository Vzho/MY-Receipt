import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_WEBHOOK_TIMEOUT_MS = 10000
const DEFAULT_WEBHOOK_RETRIES = 2
const DEFAULT_WEBHOOK_RETRY_BASE_DELAY_MS = 500

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

    const body = await req.json()
    const receiptId = typeof body.receipt_id === 'string' ? body.receipt_id : ''
    if (!receiptId) return json({ error: 'receipt_id is required' }, 400)

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: receipt, error: receiptError } = await serviceClient
      .from('receipts')
      .select('*')
      .eq('id', receiptId)
      .single()
    if (receiptError) throw receiptError
    if (receipt.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

    const result = await dispatchReceiptWebhook(serviceClient, receipt)
    return json(result)
  } catch (error) {
    console.error('dispatch-webhook failed:', error)
    return json({ error: error instanceof Error ? error.message : 'Webhook dispatch failed' }, 500)
  }
})

async function dispatchReceiptWebhook(client: any, receipt: Record<string, unknown>) {
  const { data: config, error } = await client
    .from('user_webhook_configs')
    .select('url,secret,enabled,events')
    .eq('user_id', receipt.user_id)
    .eq('enabled', true)
    .single()
  if (error?.code === 'PGRST116' || !config?.url) return { dispatched: false, reason: 'No enabled webhook config' }
  if (error) throw error
  if (Array.isArray(config.events) && !config.events.includes('receipt.synced')) {
    return { dispatched: false, reason: 'Event is disabled' }
  }

  const payload = {
    event: 'receipt.synced',
    receipt_id: receipt.id,
    user_id: receipt.user_id,
    receipt,
  }
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-resitai-event': 'receipt.synced',
  }
  if (config.secret) headers['x-resitai-signature'] = await hmacHex(String(config.secret), body)

  const result = await sendWebhookWithRetry(String(config.url), { method: 'POST', headers, body })
  return { dispatched: true, status: result.status, attempts: result.attempts }
}

async function sendWebhookWithRetry(url: string, init: RequestInit) {
  const maxRetries = webhookRetryCount()
  let lastError: unknown = null
  let lastStatus = 0

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), webhookTimeoutMs())
    try {
      const response = await fetch(url, { ...init, signal: controller.signal })
      lastStatus = response.status
      if (response.ok) return { status: response.status, attempts: attempt + 1 }
      if (attempt >= maxRetries || !isRetryableWebhookStatus(response.status)) {
        throw new Error(`Webhook failed with HTTP ${response.status}`)
      }
      console.warn(`Webhook returned HTTP ${response.status}; retrying attempt ${attempt + 2}.`)
    } catch (error) {
      lastError = error
      if (attempt >= maxRetries || !isRetryableWebhookError(error)) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error(`Webhook timed out after ${Math.round(webhookTimeoutMs() / 1000)} seconds.`)
        }
        throw error
      }
      console.warn(`Webhook request failed; retrying attempt ${attempt + 2}.`, error)
    } finally {
      clearTimeout(timer)
    }

    await delay(webhookRetryDelayMs(attempt))
  }

  if (lastError instanceof Error) throw lastError
  throw new Error(`Webhook failed after retries${lastStatus ? ` with HTTP ${lastStatus}` : ''}`)
}

function webhookTimeoutMs() {
  const configured = Number(Deno.env.get('WEBHOOK_TIMEOUT_MS'))
  return Number.isFinite(configured) && configured >= 1000 ? configured : DEFAULT_WEBHOOK_TIMEOUT_MS
}

function webhookRetryCount() {
  const configured = Number(Deno.env.get('WEBHOOK_RETRIES'))
  return Number.isFinite(configured) && configured >= 0 ? Math.min(5, Math.floor(configured)) : DEFAULT_WEBHOOK_RETRIES
}

function webhookRetryDelayMs(attempt: number) {
  const configured = Number(Deno.env.get('WEBHOOK_RETRY_BASE_DELAY_MS'))
  const baseDelayMs = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_WEBHOOK_RETRY_BASE_DELAY_MS
  return baseDelayMs * (2 ** Math.max(0, attempt))
}

function isRetryableWebhookStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isRetryableWebhookError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase()
  return /timeout|timed out|network|fetch|failed|econnreset|temporarily|unavailable/.test(message)
}

function delay(delayMs: number) {
  if (delayMs <= 0) return Promise.resolve()
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs))
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
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
