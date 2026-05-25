export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  sleep?: (delayMs: number) => Promise<void>
  shouldRetry?: (error: unknown, attempt: number) => boolean
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

export function getRetryDelayMs(attempt: number, baseDelayMs = 500) {
  const normalizedAttempt = Math.max(0, Math.floor(attempt))
  const normalizedBase = Math.max(0, Math.floor(baseDelayMs))
  return normalizedBase * (2 ** normalizedAttempt)
}

export async function retryAsync<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? 2))
  const baseDelayMs = Math.max(0, Math.floor(options.baseDelayMs ?? 500))
  const sleep = options.sleep ?? delay
  const shouldRetry = options.shouldRetry ?? (() => true)

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error, attempt)) {
        throw error
      }

      const retryDelayMs = getRetryDelayMs(attempt, baseDelayMs)
      options.onRetry?.(error, attempt, retryDelayMs)
      if (retryDelayMs > 0) {
        await sleep(retryDelayMs)
      }
    }
  }
}

export function isRetryableHttpStatus(status: number | null | undefined) {
  if (!Number.isFinite(status)) return false
  return status === 408 || status === 425 || status === 429 || Number(status) >= 500
}

export function isRetryableSupabaseError(error: unknown) {
  const status = extractErrorStatus(error)
  if (isRetryableHttpStatus(status)) return true
  if (Number.isFinite(status)) return false

  const message = extractErrorMessage(error).toLowerCase()
  if (!message) return true
  if (/invalid|not found|permission|jwt|schema|column|relation|bucket|mime|file size/.test(message)) return false
  return /timeout|timed out|network|fetch|failed|unavailable|temporarily|rate limit|econnreset|502|503|504|429/.test(message)
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '')
  }
  return String(error ?? '')
}

function extractErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const record = error as Record<string, unknown>
  const directStatus = Number(record.status ?? record.statusCode ?? record.code)
  if (Number.isFinite(directStatus)) return directStatus
  const context = record.context
  if (context && typeof context === 'object') {
    const contextStatus = Number((context as Record<string, unknown>).status)
    if (Number.isFinite(contextStatus)) return contextStatus
  }
  return null
}

function delay(delayMs: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs)
  })
}
