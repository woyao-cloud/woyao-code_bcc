/**
 * Snip Projection — snip boundary detection and message projection.
 * Extracted from snipCompact.ts to separate projection logic from
 * snip creation and execution.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ============================================================
// Types
// ============================================================

export interface SnipEntry {
  msg: BetaMessageParam
  uuid: string
}

// ============================================================
// Snip Boundary Detection
// ============================================================

/**
 * Check whether a BetaMessageParam is a snip_boundary system message.
 */
export function isSnipBoundaryMessage(msg: BetaMessageParam): boolean {
  const m = msg as unknown as Record<string, unknown>
  return m.role === 'system' && m.subtype === 'snip_boundary'
}

/**
 * Extract removedUuids from a snip_boundary message.
 */
export function getRemovedUuids(msg: BetaMessageParam): string[] | undefined {
  const m = msg as unknown as Record<string, unknown>
  const meta = m.snipMetadata as { removedUuids?: string[] } | undefined
  return meta?.removedUuids
}

// ============================================================
// Token Estimation
// ============================================================

export function estimateMessageTokens(msg: BetaMessageParam): number {
  if (typeof msg.content === 'string') {
    return Math.max(1, Math.ceil(msg.content.length / 4))
  }
  if (Array.isArray(msg.content)) {
    let chars = 0
    for (const block of msg.content) {
      if (typeof block === 'string') {
        chars += block.length
      } else if (block && typeof block === 'object') {
        chars += JSON.stringify(block).length
      }
    }
    return Math.max(1, Math.ceil(chars / 4))
  }
  return 1
}

// ============================================================
// Projection
// ============================================================

/**
 * Accumulatively collect removedUuids from ALL snip_boundary messages
 * (not just the last one). Filters out any message whose UUID appears
 * in any boundary's removedUuids set.
 */
export function projectSnippedView(entries: SnipEntry[]): SnipEntry[] {
  const allRemoved = new Set<string>()

  for (const entry of entries) {
    if (isSnipBoundaryMessage(entry.msg)) {
      const uuids = getRemovedUuids(entry.msg)
      if (uuids) {
        for (const id of uuids) {
          allRemoved.add(id)
        }
      }
    }
  }

  if (allRemoved.size === 0) {
    return entries
  }

  return entries.filter(entry => !allRemoved.has(entry.uuid))
}

/**
 * Estimate total tokens freed by snip boundaries.
 * Sums tokens of all messages whose UUIDs appear in any boundary's removedUuids.
 */
export function estimateSnipTokensFreed(entries: SnipEntry[]): number {
  const allRemoved = new Set<string>()

  for (const entry of entries) {
    if (isSnipBoundaryMessage(entry.msg)) {
      const uuids = getRemovedUuids(entry.msg)
      if (uuids) {
        for (const id of uuids) {
          allRemoved.add(id)
        }
      }
    }
  }

  if (allRemoved.size === 0) return 0

  let tokens = 0
  for (const entry of entries) {
    if (allRemoved.has(entry.uuid)) {
      tokens += estimateMessageTokens(entry.msg)
    }
  }
  return tokens
}
