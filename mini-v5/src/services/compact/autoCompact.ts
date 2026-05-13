/**
 * Auto-compact system for mini-v5.
 * Manages long conversations by summarizing older messages.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

const TOKEN_LIMIT_RATIO = 0.7
const ESTIMATED_MAX_TOKENS = 100_000

/**
 * Roughly estimate tokens in a message array.
 * Simple heuristic: 1 token ~ 4 characters for English text.
 */
export function estimateTokens(messages: BetaMessageParam[]): number {
  let total = 0
  for (const msg of messages) {
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content)
    total += Math.ceil(content.length / 4)
  }
  return total
}

/**
 * Check if conversation needs compaction.
 */
export function needsCompaction(messages: BetaMessageParam[]): boolean {
  const tokens = estimateTokens(messages)
  return tokens > ESTIMATED_MAX_TOKENS * TOKEN_LIMIT_RATIO
}

/**
 * Compact conversation by keeping system context and last N message pairs.
 * A pair = user message + assistant response.
 */
export function compactMessages(
  messages: BetaMessageParam[],
  keepPairs: number = 3,
): BetaMessageParam[] {
  if (messages.length <= keepPairs * 2) return messages

  // Keep the first message (often setup/context) and last N pairs
  const toKeep = Math.min(keepPairs * 2, messages.length)
  const kept = [messages[0], ...messages.slice(-toKeep)]

  return kept
}

/**
 * Generate a compaction summary for the removed messages.
 */
export function generateCompactionSummary(removed: BetaMessageParam[]): string {
  if (removed.length === 0) return ''

  const userMessages = removed.filter(m => m.role === 'user')
  const summaries = userMessages.slice(0, 5).map(m => {
    const content = typeof m.content === 'string' ? m.content : ''
    return '- ' + content.slice(0, 100)
  })

  return (
    '[Earlier conversation summary: ' +
    removed.length +
    ' messages covering: ' +
    summaries.join('; ') +
    ']'
  )
}
