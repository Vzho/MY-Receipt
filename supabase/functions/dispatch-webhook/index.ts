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

  const response = await fetch(String(config.url), { method: 'POST', headers, body })
  if (!response.ok) throw new Error(`Webhook failed with HTTP ${response.status}`)
  return { dispatched: true, status: response.status }
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
