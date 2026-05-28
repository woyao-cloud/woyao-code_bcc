/**
 * Cache hit rate monitoring and low hit rate warning.
 * Tracks prompt cache effectiveness per-query-source and warns
 * when hit rate drops below the configured threshold.
 */

export interface CacheHitRateInfo {
  hitRate: number
  threshold: number
  trend: number | null
  shouldWarn: boolean
}

export interface CacheMetrics {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

interface CacheWarningState {
  lastHitRate: number | null
  lastTimestamp: number | null
}

const cacheWarningStateBySource = new Map<string, CacheWarningState>()

const DEFAULT_CACHE_THRESHOLD = 80

/**
 * Calculate cache hit rate from usage metrics.
 * Returns 0-100 percentage, or null if no cache data available.
 */
export function calculateCacheHitRate(
  usage: CacheMetrics | null | undefined,
): number | null {
  if (!usage) return null

  const { input_tokens, cache_creation_input_tokens, cache_read_input_tokens } = usage

  if (cache_read_input_tokens === 0 && cache_creation_input_tokens === 0) {
    return null
  }

  const totalInputTokens =
    input_tokens + cache_creation_input_tokens + cache_read_input_tokens
  if (totalInputTokens === 0) return null

  return (cache_read_input_tokens / totalInputTokens) * 100
}

/**
 * Check whether a cache warning should be shown based on the current
 * turn's usage data and the per-source tracking state.
 */
export function shouldShowCacheWarning(
  usage: CacheMetrics | null | undefined,
  querySource: string,
  threshold: number = DEFAULT_CACHE_THRESHOLD,
): CacheHitRateInfo | null {
  const hitRate = calculateCacheHitRate(usage)
  if (hitRate === null) return null

  let state = cacheWarningStateBySource.get(querySource)
  if (!state) {
    state = { lastHitRate: null, lastTimestamp: null }
    cacheWarningStateBySource.set(querySource, state)
  }

  // First request — record baseline, no warning yet
  if (state.lastHitRate === null) {
    state.lastHitRate = hitRate
    state.lastTimestamp = Date.now()
    return null
  }

  const trend = hitRate - state.lastHitRate
  state.lastHitRate = hitRate
  state.lastTimestamp = Date.now()

  if (hitRate < threshold) {
    return { hitRate, threshold, trend, shouldWarn: true }
  }

  return null
}

/**
 * Build a human-readable cache warning string.
 */
export function formatCacheWarning(info: CacheHitRateInfo): string {
  const { hitRate, threshold, trend } = info
  let msg = `Cache hit rate ${hitRate.toFixed(0)}%, below ${threshold}% threshold`

  if (trend !== null && Math.abs(trend) > 0.1) {
    const arrow = trend > 0 ? '↑' : '↓'
    msg += ` (${arrow}${Math.abs(trend).toFixed(0)}%)`
  }

  return msg
}

/**
 * Reset tracking state for a specific query source (e.g. after model switch).
 */
export function resetCacheWarningState(querySource: string): void {
  cacheWarningStateBySource.delete(querySource)
}
