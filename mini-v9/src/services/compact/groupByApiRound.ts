/**
 * Group messages by API round boundaries.
 * Each assistant message marks the start of a new round.
 * Useful for smarter reactive compact decisions.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

/**
 * Group messages into API rounds. A new round starts at each assistant message.
 * For non-streaming use, this is equivalent to grouping by API response boundaries.
 *
 * Example:
 *   [User("u1"), Assistant("a1"), User("tr1"), Assistant("a2"), User("u2"), Assistant("a3")]
 *   → [[User("u1"), Assistant("a1")], [User("tr1"), Assistant("a2")], [User("u2"), Assistant("a3")]]
 */
export function groupByApiRound(messages: BetaMessageParam[]): BetaMessageParam[][] {
  const groups: BetaMessageParam[][] = []
  let current: BetaMessageParam[] = []

  for (const msg of messages) {
    if (msg.role === 'assistant' && current.length > 0) {
      groups.push(current)
      current = [msg]
    } else {
      current.push(msg)
    }
  }

  if (current.length > 0) {
    groups.push(current)
  }

  return groups
}

/**
 * Drop the oldest group(s) from messages grouped by API round.
 * Returns the flattened result.
 */
export function dropOldestGroups(
  messages: BetaMessageParam[],
  keepGroups: number = 1,
): BetaMessageParam[] {
  const groups = groupByApiRound(messages)
  if (groups.length <= keepGroups) return messages

  const kept = groups.slice(-keepGroups)
  return kept.flat()
}
