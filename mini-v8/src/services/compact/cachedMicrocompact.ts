/**
 * Cached Microcompact — caches the result of microcompactToolResults
 * so the microcompact pass can be skipped on subsequent turns when
 * messages haven't changed.
 */

import { microcompactToolResults } from './autoCompact.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

export interface CachedMCState {
  messageCount: number
  messageIdentity: string
  lastResult: BetaMessageParam[] | null
}

// Module-level ref for post-compact cleanup (registered by whoever creates state)
let globalCachedMCStateRef: CachedMCState | null = null

/**
 * Register the cached MC state for cleanup (called from createCachedMCState).
 */
export function registerCachedMCState(state: CachedMCState): void {
  globalCachedMCStateRef = state
}

/**
 * Reset the globally registered cached MC state (called from postCompactCleanup).
 */
export function resetGlobalCachedMCState(): void {
  if (globalCachedMCStateRef) {
    globalCachedMCStateRef.messageCount = 0
    globalCachedMCStateRef.messageIdentity = ''
    globalCachedMCStateRef.lastResult = null
  }
}

/**
 * Reset a specific cached microcompact state instance.
 */
export function resetCachedMCState(state: CachedMCState): void {
  state.messageCount = 0
  state.messageIdentity = ''
  state.lastResult = null
}

/**
 * Create a new CachedMCState, registering it for global cleanup.
 */
export function createCachedMCState(): CachedMCState {
  const state: CachedMCState = {
    messageCount: 0,
    messageIdentity: '',
    lastResult: null,
  }
  registerCachedMCState(state)
  return state
}

/**
 * Attempt to use cached microcompact result. If messages haven't changed
 * since the last microcompact, returns the cached result. Otherwise,
 * runs microcompactToolResults and caches the result.
 */
export function getMicrocompactWithCache(
  state: CachedMCState,
  messages: BetaMessageParam[],
): BetaMessageParam[] {
  const identity = computeMessageIdentity(messages)

  if (
    state.lastResult !== null &&
    state.messageCount === messages.length &&
    state.messageIdentity === identity
  ) {
    return state.lastResult
  }

  const result = microcompactToolResults(messages)
  state.messageCount = messages.length
  state.messageIdentity = identity
  state.lastResult = result
  return result
}

/**
 * Compute a lightweight identity fingerprint for messages.
 * Uses first/last role + content length to detect changes cheaply.
 */
function computeMessageIdentity(messages: BetaMessageParam[]): string {
  if (messages.length === 0) return 'empty'
  const first = messages[0]
  const last = messages[messages.length - 1]
  const firstContent =
    typeof first.content === 'string'
      ? first.content.slice(0, 100)
      : `[${(first.content as unknown[])?.length ?? 0}]`
  const lastContent =
    typeof last.content === 'string'
      ? last.content.slice(0, 100)
      : `[${(last.content as unknown[])?.length ?? 0}]`
  return `${first.role}:${firstContent}|${last.role}:${lastContent}|${messages.length}`
}
