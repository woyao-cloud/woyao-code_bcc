/**
 * Retry logic with error classification and exponential backoff for mini-v9.
 */

export type ErrorCategory =
  | 'rate_limit'
  | 'server_error'
  | 'auth_error'
  | 'connection_error'
  | 'prompt_too_long'
  | 'aborted'
  | 'unknown'

export interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Persistent mode: extend retry count for connection errors */
  persistent?: boolean
  /** Optional signal to abort retry loop externally */
  signal?: AbortSignal
  /** Called when an auth error occurs that might be OAuth-refreshable */
  onAuthError?: () => Promise<void>
}

export interface RetryEvent {
  type: 'retry'
  attempt: number
  maxRetries: number
  error: string
  category: ErrorCategory
  delayMs: number
}

/** Extended retry event for cooldown / overload scenarios */
export interface RetryCooldownEvent {
  type: 'cooldown'
  reason: 'fast_mode' | 'overload'
  durationMs: number
  message: string
}

// ============================================================
// Error Classification
// ============================================================

/**
 * Classify an API error into one of 7 categories.
 * Used to determine retry eligibility and backoff strategy.
 */
export function classifyAPIError(err: unknown): ErrorCategory {
  if (!(err instanceof Error)) return 'unknown'
  const msg = err.message.toLowerCase()
  const status =
    (err as unknown as Record<string, unknown>).status as number | undefined

  // Abort signal errors — never retry
  if (
    msg.includes('aborterror') ||
    msg.includes('the operation was aborted') ||
    msg.includes('this operation was aborted')
  ) {
    return 'aborted'
  }

  // Rate limits (429)
  if (status === 429 || msg.includes('429') || msg.includes('rate limit')) {
    return 'rate_limit'
  }

  // Auth errors (401, 403)
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('auth') ||
    msg.includes('api key')
  ) {
    return 'auth_error'
  }

  // Server errors (5xx)
  if (
    status === 502 ||
    status === 503 ||
    (status !== undefined && status >= 500 && status < 600) ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('internal server') ||
    msg.includes('service unavailable')
  ) {
    return 'server_error'
  }

  // Connection / network errors
  if (
    msg.includes('timeout') ||
    msg.includes('connection') ||
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed')
  ) {
    return 'connection_error'
  }

  // Prompt too long
  if (
    msg.includes('too long') ||
    msg.includes('too many tokens') ||
    msg.includes('prompt length') ||
    msg.includes('max input') ||
    msg.includes('context length')
  ) {
    return 'prompt_too_long'
  }

  return 'unknown'
}

/**
 * Parse Retry-After header from error response.
 * Supports both seconds (numeric) and HTTP-date format.
 */
export function parseRetryAfterHeader(err: Error): number | null {
  const headers = (err as unknown as Record<string, unknown>)
    .headers as Record<string, string> | null
  if (!headers) return null

  const retryAfter = headers['retry-after'] ?? headers['Retry-After']
  if (!retryAfter) return null

  const seconds = parseInt(retryAfter, 10)
  if (!isNaN(seconds)) return seconds * 1000

  const parsed = Date.parse(retryAfter)
  if (!isNaN(parsed)) return Math.max(0, parsed - Date.now())

  return null
}

/**
 * Returns true if the error category should be retried.
 */
export function isRetryableCategory(category: ErrorCategory): boolean {
  return (
    category === 'rate_limit' ||
    category === 'server_error' ||
    category === 'connection_error'
  )
}

/**
 * Calculate backoff delay based on category and attempt number.
 * - rate_limit: 500ms base + jitter + Retry-After header support
 * - server_error: 1s base, 16s cap
 * - connection_error: 500ms base, 8s cap
 * - Others: 0 (not retryable, should not be called)
 */
export function calculateBackoff(
  category: ErrorCategory,
  attempt: number,
  err?: Error,
): number {
  if (category === 'rate_limit' && err) {
    const headerDelay = parseRetryAfterHeader(err)
    if (headerDelay !== null) return headerDelay
  }

  const baseDelays: Record<ErrorCategory, number> = {
    rate_limit: 500,
    server_error: 1000,
    connection_error: 500,
    auth_error: 0,
    prompt_too_long: 0,
    aborted: 0,
    unknown: 1000,
  }

  const maxDelays: Record<ErrorCategory, number> = {
    rate_limit: 30000,
    server_error: 16000,
    connection_error: 8000,
    auth_error: 0,
    prompt_too_long: 0,
    aborted: 0,
    unknown: 16000,
  }

  const base = baseDelays[category] ?? 1000
  const max = maxDelays[category] ?? 16000
  const exponential = Math.min(base * 2 ** attempt, max)
  const jitter = exponential * (0.75 + Math.random() * 0.5)

  return Math.round(jitter)
}

// ============================================================
// Enhanced error detection
// ============================================================

/**
 * Detect stale/TLS connection errors. These are often transient
 * and benefit from extended retry (persistent mode).
 */
export function isStaleConnectionError(err: Error): boolean {
  const msg = err.message.toLowerCase()
  return (
    msg.includes('ssl') ||
    msg.includes('tls') ||
    msg.includes('certificate') ||
    msg.includes('cert') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('socket') ||
    msg.includes('write epipe') ||
    msg.includes('broken pipe') ||
    msg.includes('unexpected EOF')
  )
}

/**
 * Check if error indicates a server overload (529).
 */
export function isServerOverloadError(err: Error): boolean {
  const msg = err.message.toLowerCase()
  const status = (err as unknown as Record<string, unknown>).status as number | undefined
  return (
    status === 529 ||
    msg.includes('529') ||
    msg.includes('overloaded') ||
    msg.includes('service unavailable')
  )
}

/**
 * Check if error is an OAuth-refreshable auth error.
 */
export function isOAuthRefreshableError(err: Error): boolean {
  const msg = err.message.toLowerCase()
  const status = (err as unknown as Record<string, unknown>).status as number | undefined
  return (
    (status === 401 || msg.includes('401')) &&
    (msg.includes('oauth') || msg.includes('token') || msg.includes('unauthorized'))
  )
}

// ============================================================
// Retry Generator
// ============================================================

/**
 * Async generator that wraps a generator-producing function with retry logic.
 *
 * Yields RetryEvent on each failed attempt, then forwards inner yields on success.
 * Throws the last error when retries are exhausted or error is non-retryable.
 *
 * Usage:
 *   const gen = retryWithBackoff(async function* () {
 *     const stream = streamClaudeAPI(params)
 *     for await (const event of stream) yield event
 *   })
 *   for await (const item of gen) {
 *     if ((item as RetryEvent).type === 'retry') { ... }
 *     else { process(item as StreamEvent) }
 *   }
 */
export async function* retryWithBackoff<T>(
  fn: () => AsyncGenerator<T>,
  options: RetryOptions = {},
): AsyncGenerator<RetryEvent | RetryCooldownEvent | T> {
  const baseMaxRetries = options.maxRetries ?? 3
  // Persistent mode: double retries for connection errors
  const effectiveMaxRetries =
    options.persistent ? baseMaxRetries * 2 : baseMaxRetries

  let consecutiveOverloads = 0
  const OVERLOAD_THRESHOLD = 2 // enter cooldown after 2 overload errors

  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
    // Check abort signal
    if (options.signal?.aborted) {
      throw new Error('Request was aborted.')
    }

    try {
      const gen = fn()
      for await (const value of gen) {
        yield value
      }
      return // success
    } catch (err: unknown) {
      const lastError = err instanceof Error ? err : new Error(String(err))
      const category = classifyAPIError(lastError)

      if (category === 'aborted') {
        throw lastError
      }

      // OAuth token refresh on auth errors
      if (category === 'auth_error' && isOAuthRefreshableError(lastError)) {
        if (options.onAuthError) {
          await options.onAuthError()
          // Retry immediately after refresh
          continue
        }
      }

      // Persistent mode: extend retry for stale connections
      if (options.persistent && isStaleConnectionError(lastError)) {
        // Still use backoff but don't count toward normal retries
        const delayMs = calculateBackoff(category, attempt, lastError)
        yield {
          type: 'retry' as const,
          attempt: attempt + 1,
          maxRetries: effectiveMaxRetries,
          error: lastError.message,
          category,
          delayMs,
        }
        await sleep(delayMs)
        if (attempt >= baseMaxRetries) continue // beyond normal limit — keep going in persistent mode
      }

      if (!isRetryableCategory(category) || attempt >= effectiveMaxRetries) {
        throw lastError
      }

      // Server overload cooldown detection
      if (isServerOverloadError(lastError)) {
        consecutiveOverloads++
        if (consecutiveOverloads >= OVERLOAD_THRESHOLD) {
          const cooldownMs = 10_000
          yield {
            type: 'cooldown' as const,
            reason: 'overload',
            durationMs: cooldownMs,
            message: 'Server overloaded, cooling down before retry...',
          }
          await sleep(cooldownMs)
          consecutiveOverloads = 0
          continue
        }
      } else {
        consecutiveOverloads = 0
      }

      const delayMs = calculateBackoff(category, attempt, lastError)

      yield {
        type: 'retry' as const,
        attempt: attempt + 1,
        maxRetries: effectiveMaxRetries,
        error: lastError.message,
        category,
        delayMs,
      }

      await sleep(delayMs)
    }
  }

  throw new Error('Retry exhausted')
}

// ============================================================
// Legacy API — kept for backward compatibility
// ============================================================

export interface LegacyRetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  onRetry?: (attempt: number, error: Error) => void
  /** Persistent mode: extend retries for connection errors */
  persistent?: boolean
  /** Called when an auth error occurs that might be OAuth-refreshable */
  onAuthError?: () => Promise<void>
}

/**
 * Execute a function with retry logic (legacy Promise-based API).
 * Retains the original behavior for callers that don't need streaming.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: LegacyRetryOptions = {},
): Promise<T> {
  const baseMaxRetries = options.maxRetries ?? 3
  const effectiveMaxRetries =
    options.persistent ? baseMaxRetries * 2 : baseMaxRetries
  const baseDelay = options.baseDelayMs ?? 1000
  const maxDelay = options.maxDelayMs ?? 30000

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      // OAuth token refresh on auth errors
      if (
        attempt < effectiveMaxRetries &&
        isOAuthRefreshableError(lastError) &&
        options.onAuthError
      ) {
        await options.onAuthError()
        continue // retry immediately after refresh
      }

      if (attempt < effectiveMaxRetries) {
        const delay = Math.min(baseDelay * 2 ** attempt, maxDelay)
        options.onRetry?.(attempt + 1, lastError)
        await sleep(delay)
      } else {
        throw lastError
      }
    }
  }

  throw lastError ?? new Error('Retry failed')
}

/**
 * Check if an error is retryable (legacy — uses classifyAPIError internally).
 */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return isRetryableCategory(classifyAPIError(err))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
