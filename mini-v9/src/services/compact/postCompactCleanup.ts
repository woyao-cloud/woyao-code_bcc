/**
 * Post-compact cleanup — resets module-level caches after compaction
 * to prevent stale state from affecting subsequent turns.
 */

import { invalidateSystemContextCache } from '../context/contextCacheState.js'
import { resetGlobalCachedMCState } from './cachedMicrocompact.js'

/**
 * Run post-compact cleanup.
 * Call this after any compaction operation (auto, reactive, or manual).
 */
export function runPostCompactCleanup(): void {
  // 1. Reset cached microcompact state if active
  resetGlobalCachedMCState()

  // 2. Invalidate system context cache (forces re-assembly on next turn)
  invalidateSystemContextCache()
}
