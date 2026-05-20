/**
 * Snip Compact — selectively removes old messages from conversation history
 * by injecting a snip_boundary system message that records which UUIDs to remove.
 * On the next API projection, those messages are physically filtered out,
 * reducing token consumption without losing the boundary record.
 */

import { randomUUID } from '../../utils/crypto.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ============================================================
// Types
// ============================================================

export interface SnipEntry {
  msg: BetaMessageParam
  uuid: string
}

export interface SnipBoundaryMessage {
  role: 'system'
  content: string
  subtype: 'snip_boundary'
  uuid: string
  isMeta: true
  timestamp: string
  snipMetadata: {
    removedUuids: string[]
  }
}

export interface SnipResult {
  entries: SnipEntry[]
  executed: boolean
  tokensFreed: number
}

// ============================================================
// Constants
// ============================================================

const SNIP_NUDGE_THRESHOLD = 30

export const SNIP_NUDGE_TEXT =
  'The conversation history is getting long. Consider using /force-snip to compress older messages, freeing context window space for continued work.'

// ============================================================
// Snip Boundary Detection
// ============================================================

/**
 * Check whether a BetaMessageParam is a snip_boundary system message.
 */
function isSnipBoundary(msg: BetaMessageParam): boolean {
  const m = msg as unknown as Record<string, unknown>
  return m.role === 'system' && m.subtype === 'snip_boundary'
}

/**
 * Extract removedUuids from a snip_boundary message.
 */
function getRemovedUuids(msg: BetaMessageParam): string[] | undefined {
  const m = msg as unknown as Record<string, unknown>
  const meta = m.snipMetadata as { removedUuids?: string[] } | undefined
  return meta?.removedUuids
}

// ============================================================
// Token Estimation
// ============================================================

function estimateMessageTokens(msg: BetaMessageParam): number {
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
// Core Snip Logic
// ============================================================

/**
 * Scan backward for the last snip_boundary message.
 * If found and it has removedUuids, filter those messages out.
 * Only removes entries whose UUID appears in the last boundary's removedUuids.
 */
export function snipCompactIfNeeded(entries: SnipEntry[]): SnipResult {
  // Scan backward from second-to-last (the last might be the boundary itself)
  let boundaryIdx = -1
  let removedUuids: string[] | undefined

  for (let i = entries.length - 1; i >= 0; i--) {
    if (isSnipBoundary(entries[i].msg)) {
      boundaryIdx = i
      removedUuids = getRemovedUuids(entries[i].msg)
      break
    }
  }

  if (boundaryIdx === -1) {
    return { entries, executed: false, tokensFreed: 0 }
  }

  // No removedUuids → keep everything from boundary onward
  if (!removedUuids || removedUuids.length === 0) {
    return {
      entries: entries.slice(boundaryIdx),
      executed: true,
      tokensFreed: 0,
    }
  }

  // Filter out messages whose UUID is in removedUuids (keep boundary itself)
  const removedSet = new Set(removedUuids)
  let tokensFreed = 0
  const kept: SnipEntry[] = []

  for (const entry of entries) {
    if (removedSet.has(entry.uuid)) {
      tokensFreed += estimateMessageTokens(entry.msg)
      // Keep the boundary message itself even if its UUID is somehow in removed set
      if (isSnipBoundary(entry.msg)) {
        kept.push(entry)
      }
    } else {
      kept.push(entry)
    }
  }

  return { entries: kept, executed: true, tokensFreed }
}

/**
 * Accumulative version: collect removedUuids from ALL snip_boundary messages
 * (not just the last one). Useful for API projection where we want to
 * filter out anything ever marked as removed.
 */
export function projectSnippedView(entries: SnipEntry[]): SnipEntry[] {
  const allRemoved = new Set<string>()

  for (const entry of entries) {
    if (isSnipBoundary(entry.msg)) {
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

// ============================================================
// Boundary Creation
// ============================================================

/**
 * Create a snip_boundary system message that marks all given UUIDs as removed.
 */
export function createSnipBoundaryMessage(
  allUuids: string[],
): SnipBoundaryMessage {
  return {
    role: 'system',
    subtype: 'snip_boundary',
    content: '[snip] Conversation history before this point has been snipped.',
    uuid: 'snip-' + randomUUID().slice(0, 8),
    isMeta: true,
    timestamp: new Date().toISOString(),
    snipMetadata: {
      removedUuids: [...allUuids],
    },
  }
}

/**
 * Convert a SnipBoundaryMessage to BetaMessageParam (for pushing to buffers).
 */
export function snipBoundaryToMessageParam(
  boundary: SnipBoundaryMessage,
): BetaMessageParam {
  return boundary as unknown as BetaMessageParam
}

// ============================================================
// Nudge
// ============================================================

export function shouldNudgeForSnips(messageCount: number): boolean {
  return messageCount >= SNIP_NUDGE_THRESHOLD
}
