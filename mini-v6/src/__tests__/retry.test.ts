import { describe, test, expect } from 'bun:test'
import { withRetry, isRetryableError } from '../services/retry.js'

describe('withRetry', () => {
  test('returns result on first success', async () => {
    let called = 0
    const fn = async () => {
      called++
      return 'success'
    }
    const result = await withRetry(fn, { maxRetries: 2 })
    expect(result).toBe('success')
    expect(called).toBe(1)
  })

  test('retries on failure and eventually succeeds', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      if (calls < 3) throw new Error('fail')
      return 'ok'
    }
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 })
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  test('throws after exhausting retries', async () => {
    let calls = 0
    const fn = async () => {
      calls++
      throw new Error('always fails')
    }
    let caught: Error | null = null
    try {
      await withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })
    } catch (err) {
      caught = err as Error
    }
    expect(caught).not.toBe(null)
    expect(caught!.message).toBe('always fails')
    expect(calls).toBe(3) // initial + 2 retries
  })

  test('calls onRetry callback', async () => {
    let onRetryCalls: Array<[number, Error]> = []
    let fnCalls = 0
    const fn = async () => {
      fnCalls++
      if (fnCalls < 2) throw new Error('transient')
      return 'done'
    }
    await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      onRetry: (attempt: number, err: Error) => {
        onRetryCalls.push([attempt, err])
      },
    })
    expect(onRetryCalls.length).toBe(1)
    expect(onRetryCalls[0][0]).toBe(1)
    expect(onRetryCalls[0][1]).toBeInstanceOf(Error)
  })

  test('uses exponential backoff', async () => {
    const fn = async () => {
      throw new Error('fail')
    }
    const start = Date.now()
    try {
      await withRetry(fn, { maxRetries: 2, baseDelayMs: 50, maxDelayMs: 200 })
    } catch {}
    const elapsed = Date.now() - start
    // 50 + 100 = 150ms minimum
    expect(elapsed).toBeGreaterThanOrEqual(100)
  })

  test('respects maxDelayMs', async () => {
    const fn = async () => {
      throw new Error('fail')
    }
    const start = Date.now()
    try {
      await withRetry(fn, { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 50 })
    } catch {}
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)
  })

  test('passes args through to retried function', async () => {
    let captured: string | undefined
    const fn = async (name: string) => {
      captured = name
      return `hello ${name}`
    }
    const result = await withRetry(() => fn('world'), { maxRetries: 1 })
    expect(result).toBe('hello world')
    expect(captured).toBe('world')
  })
})

describe('isRetryableError', () => {
  test('returns true for rate limit', () => {
    expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true)
  })

  test('returns true for timeout', () => {
    expect(isRetryableError(new Error('connection timeout'))).toBe(true)
  })

  test('returns true for 429 status', () => {
    expect(isRetryableError(new Error('HTTP 429'))).toBe(true)
  })

  test('returns true for 503', () => {
    expect(isRetryableError(new Error('Server error 503'))).toBe(true)
  })

  test('returns true for ECONNREFUSED', () => {
    expect(isRetryableError(new Error('connect ECONNREFUSED'))).toBe(true)
  })

  test('returns true for ETIMEDOUT', () => {
    expect(isRetryableError(new Error('ETIMEDOUT'))).toBe(true)
  })

  test('returns false for non-Error', () => {
    expect(isRetryableError('string error')).toBe(false)
  })

  test('returns false for non-retryable error', () => {
    expect(isRetryableError(new Error('invalid API key'))).toBe(false)
  })

  test('returns false for null', () => {
    expect(isRetryableError(null)).toBe(false)
  })

  test('is case-insensitive', () => {
    expect(isRetryableError(new Error('RATE LIMIT'))).toBe(true)
  })

  test('returns false for undefined', () => {
    expect(isRetryableError(undefined)).toBe(false)
  })
})
