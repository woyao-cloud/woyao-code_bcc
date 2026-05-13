/**
 * Retry logic with exponential backoff for mini-v5.
 */

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  onRetry?: (attempt: number, error: Error) => void
}

/**
 * Execute a function with retry logic.
 * Retries on errors with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3
  const baseDelay = options.baseDelayMs ?? 1000
  const maxDelay = options.maxDelayMs ?? 30000

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * 2 ** attempt, maxDelay)
        if (options.onRetry) {
          options.onRetry(attempt + 1, lastError)
        }
        await sleep(delay)
      }
    }
  }

  throw lastError ?? new Error('Retry failed')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Check if an error is retryable (network errors, rate limits).
 */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()

  const retryablePatterns = [
    'rate',
    'limit',
    'timeout',
    'connection',
    'network',
    'econnrefused',
    'econnreset',
    'etimedout',
    '429',
    '503',
    '502',
  ]

  return retryablePatterns.some(p => msg.includes(p))
}
