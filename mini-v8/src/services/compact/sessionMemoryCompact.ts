/**
 * Session memory compaction — uses persisted session memory notes as the
 * compaction summary instead of generating a heuristic or LLM-based summary.
 * This avoids an extra API call and preserves richer context.
 *
 * Entry point: trySessionMemoryCompaction(messages)
 * Returns compacted messages or null if SM compaction cannot be used.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  getLastSummarizedMessageId,
  getSessionMemoryForPrompt,
  getSessionMemoryConfig,
  isSessionMemoryEmpty,
  truncateSessionMemoryForCompact,
  readSessionMemory,
  getSessionId,
  SESSION_MEMORY_COMPACTION_MARKER,
} from '../memory/sessionMemory.js'
import { estimateTokens } from './autoCompact.js'

// ============================================================
// Types
// ============================================================

export interface SessionMemoryCompactConfig {
  /** Minimum tokens to preserve after compaction */
  minTokens: number
  /** Minimum number of messages with text blocks to keep */
  minTextBlockMessages: number
  /** Maximum tokens to preserve after compaction (hard cap) */
  maxTokens: number
}

export interface SessionMemoryCompactResult {
  /** Whether compaction produced a result */
  didCompact: boolean
  /** The compacted message array */
  messages: BetaMessageParam[]
  /** The session memory summary text used */
  summaryText: string
  /** The index from which messages were kept */
  keptStartIndex: number
}

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_SM_COMPACT_CONFIG: SessionMemoryCompactConfig = {
  minTokens: 10_000,
  minTextBlockMessages: 5,
  maxTokens: 40_000,
}

let smCompactConfig: SessionMemoryCompactConfig = {
  ...DEFAULT_SM_COMPACT_CONFIG,
}

const COMPACT_PROMPT_MAX_NOTES_PER_CATEGORY = 5
const COMPACT_PROMPT_MAX_CHARS = 2000

// ============================================================
// Config Management
// ============================================================

export function getSessionMemoryCompactConfig(): SessionMemoryCompactConfig {
  return { ...smCompactConfig }
}

export function setSessionMemoryCompactConfig(
  updates: Partial<SessionMemoryCompactConfig>,
): void {
  smCompactConfig = { ...smCompactConfig, ...updates }
}

export function resetSessionMemoryCompactConfig(): void {
  smCompactConfig = { ...DEFAULT_SM_COMPACT_CONFIG }
}

// ============================================================
// Index Calculation
// ============================================================

/**
 * Check if a BetaMessageParam contains text content blocks.
 */
function hasTextBlocks(msg: BetaMessageParam): boolean {
  if (msg.role === 'assistant' || msg.role === 'user') {
    if (typeof msg.content === 'string') {
      return msg.content.length > 0
    }
    if (Array.isArray(msg.content)) {
      return msg.content.some(
        block =>
          typeof block === 'object' &&
          block !== null &&
          (block as unknown as Record<string, unknown>).type === 'text',
      )
    }
  }
  return false
}

/**
 * Collect tool_use IDs from an assistant message.
 */
function getToolUseIds(msg: BetaMessageParam): string[] {
  if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return []
  const ids: string[] = []
  for (const block of msg.content) {
    const b = block as unknown as Record<string, unknown>
    if (b.type === 'tool_use' && typeof b.id === 'string') {
      ids.push(b.id)
    }
  }
  return ids
}

/**
 * Collect tool_result tool_use_ids from a user message.
 */
function getToolResultIds(msg: BetaMessageParam): string[] {
  if (msg.role !== 'user' || !Array.isArray(msg.content)) return []
  const ids: string[] = []
  for (const block of msg.content) {
    const b = block as unknown as Record<string, unknown>
    if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
      ids.push(b.tool_use_id)
    }
  }
  return ids
}

/**
 * Check if an assistant message contains tool_use blocks with any of the given ids.
 */
function hasToolUseWithIds(
  msg: BetaMessageParam,
  toolUseIds: Set<string>,
): boolean {
  const ids = getToolUseIds(msg)
  return ids.some(id => toolUseIds.has(id))
}

/**
 * Estimate tokens for a single message.
 */
function estimateMessageTokens(msg: BetaMessageParam): number {
  if (typeof msg.content === 'string') {
    return Math.max(1, Math.ceil(msg.content.length / 4))
  }
  if (Array.isArray(msg.content)) {
    let chars = 0
    for (const block of msg.content) {
      const b = block as unknown as Record<string, unknown>
      if (typeof b.text === 'string') {
        chars += b.text.length
      } else {
        chars += JSON.stringify(b).length
      }
    }
    return Math.max(1, Math.ceil(chars / 4))
  }
  return 1
}

/**
 * Adjust start index to ensure tool_use/tool_result pairs are not split.
 * If any kept message contains tool_result blocks referencing tool_use blocks
 * that appear before startIndex, extend startIndex backwards to include them.
 */
export function adjustIndexToPreserveAPIInvariants(
  messages: BetaMessageParam[],
  startIndex: number,
): number {
  if (startIndex <= 1 || startIndex >= messages.length) {
    return startIndex
  }

  let adjustedIndex = startIndex

  // Collect tool_result IDs from ALL messages in the kept range
  const allToolResultIds: string[] = []
  for (let i = startIndex; i < messages.length; i++) {
    allToolResultIds.push(...getToolResultIds(messages[i]!))
  }

  if (allToolResultIds.length > 0) {
    // Collect tool_use IDs already in the kept range
    const toolUseIdsInKeptRange = new Set<string>()
    for (let i = adjustedIndex; i < messages.length; i++) {
      for (const id of getToolUseIds(messages[i]!)) {
        toolUseIdsInKeptRange.add(id)
      }
    }

    // Find tool_result IDs that need a matching tool_use not yet in kept range
    const neededToolUseIds = new Set(
      allToolResultIds.filter(id => !toolUseIdsInKeptRange.has(id)),
    )

    // Walk backwards to find the assistant messages with those tool_use blocks
    for (
      let i = adjustedIndex - 1;
      i >= 1 && neededToolUseIds.size > 0;
      i--
    ) {
      const message = messages[i]!
      if (message.role === 'assistant' && hasToolUseWithIds(message, neededToolUseIds)) {
        adjustedIndex = i
        // Remove found IDs from needed set
        for (const id of getToolUseIds(message)) {
          neededToolUseIds.delete(id)
        }
      }
    }
  }

  return adjustedIndex
}

/**
 * Calculate the starting index for messages to keep after compaction.
 * Starts from lastSummarizedIndex, then expands backwards to meet minimums:
 * - At least config.minTokens tokens
 * - At least config.minTextBlockMessages messages with text blocks
 * Stops expanding if config.maxTokens is reached.
 */
export function calculateMessagesToKeepIndex(
  messages: BetaMessageParam[],
  lastSummarizedIndex: number,
): number {
  if (messages.length === 0) return 0

  const config = getSessionMemoryCompactConfig()

  // Start from the message after lastSummarizedIndex
  // If lastSummarizedIndex is -1 or beyond, start from messages.length
  let startIndex = lastSummarizedIndex >= 0 ? lastSummarizedIndex + 1 : messages.length

  // Clamp to valid range
  if (startIndex >= messages.length) {
    startIndex = messages.length
  }

  // Calculate current tokens and text-block count from startIndex to end
  let totalTokens = 0
  let textBlockMessageCount = 0
  for (let i = startIndex; i < messages.length; i++) {
    totalTokens += estimateMessageTokens(messages[i]!)
    if (hasTextBlocks(messages[i]!)) {
      textBlockMessageCount++
    }
  }

  // Check if we already hit the max cap
  if (totalTokens >= config.maxTokens) {
    return adjustIndexToPreserveAPIInvariants(messages, startIndex)
  }

  // Check if we already meet both minimums
  if (
    totalTokens >= config.minTokens &&
    textBlockMessageCount >= config.minTextBlockMessages
  ) {
    return adjustIndexToPreserveAPIInvariants(messages, startIndex)
  }

  // Expand backwards until we meet both minimums or hit max cap.
  // Floor at index 1 (index 0 is the system message).
  for (let i = startIndex - 1; i >= 1; i--) {
    const msg = messages[i]!
    totalTokens += estimateMessageTokens(msg)
    if (hasTextBlocks(msg)) {
      textBlockMessageCount++
    }
    startIndex = i

    // Stop if we hit the max cap
    if (totalTokens >= config.maxTokens) break

    // Stop if we meet both minimums
    if (
      totalTokens >= config.minTokens &&
      textBlockMessageCount >= config.minTextBlockMessages
    ) {
      break
    }
  }

  return adjustIndexToPreserveAPIInvariants(messages, startIndex)
}

// ============================================================
// Main Entry Point
// ============================================================

/**
 * Try to use session memory for compaction instead of traditional compaction.
 * Returns a SessionMemoryCompactResult if successful, or null if SM compaction
 * cannot be used (no session memory, empty, or error).
 *
 * Handles two scenarios:
 * 1. Normal: lastSummarizedMessageId is set → keep only messages after that index
 * 2. Resumed session: no lastSummarizedMessageId but SM has content →
 *    keep all messages but use SM as the summary
 */
export function trySessionMemoryCompaction(
  messages: BetaMessageParam[],
): SessionMemoryCompactResult | null {
  // Respect the sessionMemoryCompactEnabled config flag
  if (!getSessionMemoryConfig().sessionMemoryCompactEnabled) return null

  const sessionId = getSessionId()
  if (!sessionId) return null

  // Check if session memory file exists and has actual content
  const existingNotes = readSessionMemory(sessionId)
  if (existingNotes.length === 0) return null

  const sessionMemoryContent = getSessionMemoryForPrompt(sessionId, {
    maxNotesPerCategory: COMPACT_PROMPT_MAX_NOTES_PER_CATEGORY,
    maxChars: COMPACT_PROMPT_MAX_CHARS,
  }).trim()

  if (!sessionMemoryContent) return null
  if (isSessionMemoryEmpty(sessionMemoryContent)) return null

  const lastSummarizedId = getLastSummarizedMessageId()
  const lastSummarizedIndex = findMessageIndexById(messages, lastSummarizedId)

  try {
    // Calculate the starting index for messages to keep
    const startIndex = calculateMessagesToKeepIndex(messages, lastSummarizedIndex)

    if (startIndex <= 1) {
      // Nothing to compact
      return null
    }

    const messagesToKeep = messages.slice(startIndex)
    const removedTokenCount = estimateTokens(messages.slice(1, startIndex))

    // Truncate session memory for compaction use
    const { truncatedContent } = truncateSessionMemoryForCompact(sessionMemoryContent)

    // Build summary message with session memory marker
    const summaryText = `${SESSION_MEMORY_COMPACTION_MARKER}\n${truncatedContent}

[Compacted ${startIndex - 1} messages using session memory, saving approximately ${removedTokenCount} tokens]`

    // Build compacted messages: system message + summary + kept messages
    const compacted: BetaMessageParam[] = [messages[0]!]

    if (summaryText.trim()) {
      compacted.push({
        role: 'assistant',
        content: summaryText,
      })
    }

    compacted.push(...messagesToKeep)

    return {
      didCompact: true,
      messages: compacted,
      summaryText,
      keptStartIndex: startIndex,
    }
  } catch {
    return null
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Compute a content fingerprint (first 40 chars of text content) for a message.
 * Used for tracking which messages have been compacted across compaction cycles.
 */
export function getMessageFingerprint(msg: BetaMessageParam): string {
  const content =
    typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content
            .map(b => {
              const block = b as unknown as Record<string, unknown>
              if (block.type === 'text' && typeof block.text === 'string') return block.text
              return ''
            })
            .join(' ')
        : ''
  return content.slice(0, 40)
}

/**
 * Find the message index by its content fingerprint.
 * Since BetaMessageParam doesn't have UUIDs, we use the lastSummarizedMessageId
 * which stores the first 40 chars of the message content as a fingerprint.
 */
function findMessageIndexById(
  messages: BetaMessageParam[],
  fingerprint: string | undefined,
): number {
  if (!fingerprint) return -1

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .map(b => {
                if (typeof b === 'string') return b
                const block = b as unknown as Record<string, unknown>
                if (block.type === 'text' && typeof block.text === 'string') {
                  return block.text
                }
                return ''
              })
              .join(' ')
          : ''

    if (content.startsWith(fingerprint)) {
      return i
    }
  }

  return -1
}
