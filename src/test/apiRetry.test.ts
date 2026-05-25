import { describe, expect, it, vi } from 'vitest'
import { getRetryDelayMs, isRetryableHttpStatus, isRetryableSupabaseError, retryAsync } from '../lib/apiRetry'

describe('api retry helpers', () => {
  it('uses exponential backoff delays', () => {
    expect(getRetryDelayMs(0, 250)).toBe(250)
    expect(getRetryDelayMs(1, 250)).toBe(500)
    expect(getRetryDelayMs(2, 250)).toBe(1000)
  })

  it('retries transient failures and returns the eventual result', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue('ok')
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(retryAsync(operation, {
      maxRetries: 2,
      baseDelayMs: 100,
      sleep,
      shouldRetry: isRetryableSupabaseError,
    })).resolves.toBe('ok')

    expect(operation).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenNthCalledWith(1, 100)
    expect(sleep).toHaveBeenNthCalledWith(2, 200)
  })

  it('does not retry non-transient client errors', async () => {
    const operation = vi.fn().mockRejectedValue({ status: 400, message: 'Invalid receipt id' })

    await expect(retryAsync(operation, {
      maxRetries: 2,
      sleep: vi.fn(),
      shouldRetry: isRetryableSupabaseError,
    })).rejects.toMatchObject({ status: 400 })

    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('classifies retryable HTTP statuses', () => {
    expect(isRetryableHttpStatus(429)).toBe(true)
    expect(isRetryableHttpStatus(503)).toBe(true)
    expect(isRetryableHttpStatus(404)).toBe(false)
  })
})
