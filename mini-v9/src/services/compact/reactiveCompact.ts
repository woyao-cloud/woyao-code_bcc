import {
  microcompactToolResults,
  compactMessages,
  needsCompaction,
} from './autoCompact.js'
import { trySessionMemoryCompaction } from './sessionMemoryCompact.js'
import { dropOldestGroups } from './groupByApiRound.js'
import { runPostCompactCleanup } from './postCompactCleanup.js'
import { llmCompact } from './llmCompact.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

export const PROMPT_TOO_LONG_ERROR_PATTERNS = [
  'prompt_too_long',
  'too large',
  'too long',
  'maximum context length',
  'context window',
  '413',
]

export function isPromptTooLongError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase()
  return PROMPT_TOO_LONG_ERROR_PATTERNS.some(pattern => lower.includes(pattern))
}

export interface ReactiveCompactResult {
  didCompact: boolean
  messages: BetaMessageParam[]
}

/**
 * Multi-stage reactive compaction. Tries increasingly aggressive strategies:
 *   0. Session memory compaction (cheapest, best quality)
 *   1. LLM-based semantic compaction (rich summaries, API call)
 *   2. Microcompact tool results (clears large tool outputs)
 *   3. Deterministic compact keepPairs:2
 *   4. Deterministic compact keepPairs:1
 *   5. Drop oldest API round group (last resort)
 */
export async function reactiveCompact(
  messages: BetaMessageParam[],
  model?: string,
): Promise<ReactiveCompactResult> {
  // Step 0: Try session memory compaction first (cheapest, best quality)
  const smResult = trySessionMemoryCompaction(messages)
  if (smResult) {
    runPostCompactCleanup()
    return { didCompact: true, messages: smResult.messages }
  }

  // Step 1: LLM-based semantic compaction, but only when there are enough
  // messages to benefit (> 6) and we're not so close to the limit that an
  // API call would also fail (buffer >= 10K tokens).
  if (messages.length > 6) {
    try {
      const llmResult = await llmCompact(messages, { direction: 'up_to' })
      if (llmResult.didCompact) {
        runPostCompactCleanup()
        return { didCompact: true, messages: llmResult.messages }
      }
    } catch {
      // LLM compact failed (e.g. prompt-too-long, network). Fall through
      // to deterministic strategies below.
    }
  }

  const microcompacted = microcompactToolResults(messages)
  if (microcompacted !== messages) {
    if (!needsCompaction(microcompacted, model)) {
      runPostCompactCleanup()
      return { didCompact: true, messages: microcompacted }
    }
  }

  const compacted = compactMessages(microcompacted, { keepPairs: 2 })
  if (compacted !== microcompacted) {
    runPostCompactCleanup()
    return { didCompact: true, messages: compacted }
  }

  const lastResort = compactMessages(microcompacted, { keepPairs: 1 })
  if (lastResort !== microcompacted) {
    runPostCompactCleanup()
    return { didCompact: true, messages: lastResort }
  }

  // Ultra last resort: drop oldest API round group
  const dropped = dropOldestGroups(microcompacted, 1)
  if (dropped.length < microcompacted.length) {
    runPostCompactCleanup()
    return { didCompact: true, messages: dropped }
  }

  return { didCompact: false, messages: microcompacted }
}
