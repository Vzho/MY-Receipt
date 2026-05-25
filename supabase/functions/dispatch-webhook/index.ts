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
const WEBHOOK_REPLAY_DELAY_MS = 5 * 60 * 1000

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
    const deliveryId = typeof body.delivery_id === 'string' ? body.delivery_id : ''
    if (!receiptId && !deliveryId) return json({ error: 'receipt_id or delivery_id is required' }, 400)

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)
    const replayDelivery = deliveryId ? await getReplayDelivery(serviceClient, deliveryId, user.id) : null
    const targetReceiptId = replayDelivery?.receipt_id || receiptId
    if (!targetReceiptId) return json({ error: 'Replay delivery has no receipt_id' }, 400)

    const { data: receipt, error: receiptError } = await serviceClient
      .from('receipts')
      .select('*')
      .eq('id', targetReceiptId)
      .single()
    if (receiptError) throw receiptError
    if (receipt.user_id !== user.id) return json({ error: 'Forbidden' }, 403)

    const result = await dispatchReceiptWebhook(serviceClient, receipt, {
      existingDeliveryId: replayDelivery?.id ?? null,
    })
    return json(result)
  } catch (error) {
    console.error('dispatch-webhook failed:', error)
    return json({ error: error instanceof Error ? error.message : 'Webhook dispatch failed' }, 500)
  }
})

async function getReplayDelivery(client: any, deliveryId: string, userId: string) {
  const { data, error } = await client
    .from('webhook_delivery_logs')
    .select('id,user_id,receipt_id,status')
    .eq('id', deliveryId)
    .single()
  if (error) {
    if (isMissingSchemaError(error)) throw new Error('Webhook replay requires the webhook_delivery_logs migration.')
    throw error
  }
  if (!data || data.user_id !== userId) throw new Error('Webhook delivery not found')
  return data as { id: string; user_id: string; receipt_id: string | null; status: string }
}

async function dispatchReceiptWebhook(
  client: any,
  receipt: Record<string, unknown>,
  options: { existingDeliveryId?: string | null } = {},
) {
  const { data: config, error } = await client
    .from('user_webhook_configs')
    .select('url,secret,enabled,events')
    .eq('user_id', receipt.user_id)
    .eq('enabled', true)
    .single()
  if (error?.code === 'PGRST116' || !config?.url) {
    const deliveryId = await upsertWebhookDeliveryLog(client, {
      existingDeliveryId: options.existingDeliveryId ?? null,
      receipt,
      endpoint: null,
      payload: buildWebhookPayload(receipt),
      status: 'skipped',
      errorMessage: 'No enabled webhook config',
    })
    return { dispatched: false, reason: 'No enabled webhook config', delivery_id: deliveryId }
  }
  if (error) throw error
  if (Array.isArray(config.events) && !config.events.includes('receipt.synced')) {
    const deliveryId = await upsertWebhookDeliveryLog(client, {
      existingDeliveryId: options.existingDeliveryId ?? null,
      receipt,
      endpoint: String(config.url),
      payload: buildWebhookPayload(receipt),
      status: 'skipped',
      errorMessage: 'Event is disabled',
    })
    return { dispatched: false, reason: 'Event is disabled', delivery_id: deliveryId }
  }

  const payload = buildWebhookPayload(receipt)
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-resitai-event': 'receipt.synced',
  }
  if (config.secret) headers['x-resitai-signature'] = await hmacHex(String(config.secret), body)

  const deliveryId = await upsertWebhookDeliveryLog(client, {
    existingDeliveryId: options.existingDeliveryId ?? null,
    receipt,
    endpoint: String(config.url),
    payload,
    status: 'pending',
  })

  try {
    const result = await sendWebhookWithRetry(String(config.url), { method: 'POST', headers, body })
    await updateWebhookDeliveryLog(client, deliveryId, {
      status: 'delivered',
      http_status: result.status,
      attempt_count: result.attempts,
      response_body: result.responseBody,
      error_message: null,
      next_retry_at: null,
      delivered_at: new Date().toISOString(),
    })
    return { dispatched: true, status: result.status, attempts: result.attempts, delivery_id: deliveryId }
  } catch (error) {
    const deliveryError = normalizeWebhookDeliveryError(error)
    await updateWebhookDeliveryLog(client, deliveryId, {
      status: 'failed',
      http_status: deliveryError.status,
      attempt_count: deliveryError.attempts,
      response_body: deliveryError.responseBody,
      error_message: deliveryError.message,
      next_retry_at: new Date(Date.now() + WEBHOOK_REPLAY_DELAY_MS).toISOString(),
      delivered_at: null,
    })
    throw error
  }
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
      if (response.ok) return { status: response.status, attempts: attempt + 1, responseBody: await safeResponseText(response) }
      if (attempt >= maxRetries || !isRetryableWebhookStatus(response.status)) {
        throw new WebhookDeliveryError(
          `Webhook failed with HTTP ${response.status}`,
          response.status,
          attempt + 1,
          await safeResponseText(response),
        )
      }
      console.warn(`Webhook returned HTTP ${response.status}; retrying attempt ${attempt + 2}.`)
    } catch (error) {
      lastError = error
      if (attempt >= maxRetries || !isRetryableWebhookError(error)) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new WebhookDeliveryError(
            `Webhook timed out after ${Math.round(webhookTimeoutMs() / 1000)} seconds.`,
            lastStatus || null,
            attempt + 1,
          )
        }
        throw error instanceof WebhookDeliveryError
          ? error
          : new WebhookDeliveryError(error instanceof Error ? error.message : 'Webhook request failed.', lastStatus || null, attempt + 1)
      }
      console.warn(`Webhook request failed; retrying attempt ${attempt + 2}.`, error)
    } finally {
      clearTimeout(timer)
    }

    await delay(webhookRetryDelayMs(attempt))
  }

  if (lastError instanceof Error) throw new WebhookDeliveryError(lastError.message, lastStatus || null, maxRetries + 1)
  throw new WebhookDeliveryError(`Webhook failed after retries${lastStatus ? ` with HTTP ${lastStatus}` : ''}`, lastStatus || null, maxRetries + 1)
}

class WebhookDeliveryError extends Error {
  status: number | null
  attempts: number
  responseBody: string | null

  constructor(message: string, status: number | null, attempts: number, responseBody: string | null = null) {
    super(message)
    this.name = 'WebhookDeliveryError'
    this.status = status
    this.attempts = attempts
    this.responseBody = responseBody
  }
}

function normalizeWebhookDeliveryError(error: unknown): WebhookDeliveryError {
  if (error instanceof WebhookDeliveryError) return error
  return new WebhookDeliveryError(error instanceof Error ? error.message : 'Webhook dispatch failed.', null, webhookRetryCount() + 1)
}

function buildWebhookPayload(receipt: Record<string, unknown>) {
  return {
    event: 'receipt.synced',
    receipt_id: receipt.id,
    user_id: receipt.user_id,
    auto_synced: receipt.auto_synced === true,
    auto_sync_rule_name: receipt.auto_sync_rule_name ?? null,
    receipt,
  }
}

async function upsertWebhookDeliveryLog(client: any, input: {
  existingDeliveryId?: string | null
  receipt: Record<string, unknown>
  endpoint: string | null
  payload: Record<string, unknown>
  status: 'pending' | 'delivered' | 'failed' | 'skipped'
  errorMessage?: string | null
}) {
  const row = {
    user_id: input.receipt.user_id,
    receipt_id: input.receipt.id,
    event: 'receipt.synced',
    endpoint: input.endpoint,
    status: input.status,
    http_status: null,
    attempt_count: 0,
    error_message: input.errorMessage ?? null,
    request_payload: input.payload,
    response_body: null,
    next_retry_at: input.status === 'failed' ? new Date(Date.now() + WEBHOOK_REPLAY_DELAY_MS).toISOString() : null,
    delivered_at: null,
  }

  if (input.existingDeliveryId) {
    const { data, error } = await client
      .from('webhook_delivery_logs')
      .update(row)
      .eq('id', input.existingDeliveryId)
      .eq('user_id', input.receipt.user_id)
      .select('id')
      .single()
    if (error) {
      if (isMissingSchemaError(error)) return null
      throw error
    }
    return data?.id ?? input.existingDeliveryId
  }

  const { data, error } = await client
    .from('webhook_delivery_logs')
    .insert(row)
    .select('id')
    .single()
  if (error) {
    if (isMissingSchemaError(error)) return null
    throw error
  }
  return data?.id ?? null
}

async function updateWebhookDeliveryLog(client: any, deliveryId: string | null, patch: Record<string, unknown>) {
  if (!deliveryId) return
  const { error } = await client
    .from('webhook_delivery_logs')
    .update(patch)
    .eq('id', deliveryId)
  if (error && !isMissingSchemaError(error)) throw error
}

async function safeResponseText(response: Response) {
  try {
    return truncateText(await response.text(), 2000)
  } catch {
    return null
  }
}

function truncateText(value: string | null, maxLength: number) {
  if (!value) return null
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
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

function isMissingSchemaError(error: unknown): boolean {
  const record = error as { code?: string; message?: string; details?: string; hint?: string }
  const code = record?.code ?? ''
  const text = `${record?.message ?? ''} ${record?.details ?? ''} ${record?.hint ?? ''}`
  return ['PGRST204', 'PGRST205', '42703', '42P01'].includes(code)
    || /schema cache|column|relation .* does not exist|webhook_delivery_logs/i.test(text)
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
