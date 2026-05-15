/**
 * Auto-compact system for mini-v5.
 * Manages long conversations by summarizing older messages.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { getMaxTokens } from '../../utils/model/model.js'
import { SESSION_MEMORY_COMPACTION_MARKER } from '../memory/sessionMemory.js'

const TOKEN_LIMIT_RATIO = 0.7
const ESTIMATED_MAX_TOKENS = 100_000
const MICROCOMPACT_TRIGGER_TOOL_RESULTS = 6
const MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS = 3
const TOOL_RESULT_MAX_TOKENS_PER_MESSAGE = 1_200
const TOOL_RESULT_MAX_TOKENS_PER_RESULT = 800
const TOOL_RESULT_PREVIEW_MAX_CHARS = 320

const COMPACTABLE_TOOL_NAMES = new Set([
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Grep',
  'Glob',
  'WebFetch',
  'WebSearch',
])

export const MICROCOMPACT_CLEAR_MESSAGE =
  '[Earlier tool result compacted to reduce token usage.]'
export const TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE =
  '[Large tool result compacted to reduce token usage.]'
const TOOL_RESULT_BUDGET_PREVIEW_PREFIX = '[Compacted '

type ContentBlock = Record<string, unknown>
interface ToolResultBudgetCandidate {
  blockIndex: number
  toolUseId: string
  tokens: number
  preview: string
  previewTokens: number
}

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function isContentBlock(value: unknown): value is ContentBlock {
  return typeof value === 'object' && value !== null
}

function isToolUseBlock(
  value: unknown,
): value is ContentBlock & { type: 'tool_use'; id: string; name: string } {
  return (
    isContentBlock(value) &&
    value.type === 'tool_use' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  )
}

function isToolResultBlock(
  value: unknown,
): value is ContentBlock & { type: 'tool_result'; tool_use_id: string } {
  return (
    isContentBlock(value) &&
    value.type === 'tool_result' &&
    typeof value.tool_use_id === 'string'
  )
}

function estimateContentTokens(content: unknown): number {
  if (typeof content === 'string') {
    return estimateTextTokens(content)
  }

  if (Array.isArray(content)) {
    return content.reduce(
      (total, block) => total + estimateContentTokens(block),
      0,
    )
  }

  if (isToolUseBlock(content)) {
    return estimateTextTokens(
      content.name + JSON.stringify(content.input ?? {}),
    )
  }

  if (isToolResultBlock(content)) {
    return estimateContentTokens(content.content ?? '')
  }

  if (isContentBlock(content) && typeof content.text === 'string') {
    return estimateTextTokens(content.text)
  }

  if (isContentBlock(content)) {
    return estimateTextTokens(JSON.stringify(content))
  }

  if (content === null || content === undefined) {
    return 0
  }

  return estimateTextTokens(String(content))
}

function getEstimatedContextWindow(model?: string): number {
  if (!model) {
    return ESTIMATED_MAX_TOKENS
  }

  return Math.max(ESTIMATED_MAX_TOKENS, getMaxTokens(model))
}

function getToolUseNameMap(messages: BetaMessageParam[]): Map<string, string> {
  const toolNames = new Map<string, string>()

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      continue
    }

    for (const block of msg.content) {
      if (isToolUseBlock(block)) {
        toolNames.set(block.id, block.name)
      }
    }
  }

  return toolNames
}

function adjustStartIndexForToolPairs(
  messages: BetaMessageParam[],
  startIndex: number,
): number {
  if (startIndex <= 1 || startIndex >= messages.length) {
    return startIndex
  }

  const keptToolUseIds = new Set<string>()
  const missingToolUseIds = new Set<string>()

  for (let i = startIndex; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg || !Array.isArray(msg.content)) {
      continue
    }

    for (const block of msg.content) {
      if (isToolUseBlock(block)) {
        keptToolUseIds.add(block.id)
      } else if (
        isToolResultBlock(block) &&
        !keptToolUseIds.has(block.tool_use_id)
      ) {
        missingToolUseIds.add(block.tool_use_id)
      }
    }
  }

  if (missingToolUseIds.size === 0) {
    return startIndex
  }

  let adjustedIndex = startIndex

  for (let i = startIndex - 1; i >= 1 && missingToolUseIds.size > 0; i--) {
    const msg = messages[i]
    if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      continue
    }

    let foundMatch = false
    for (const block of msg.content) {
      if (isToolUseBlock(block) && missingToolUseIds.has(block.id)) {
        missingToolUseIds.delete(block.id)
        foundMatch = true
      }
    }

    if (foundMatch) {
      adjustedIndex = i
    }
  }

  return adjustedIndex
}

/**
 * Roughly estimate tokens in a message array.
 * Simple heuristic: 1 token ~ 4 characters for English text.
 */
export function estimateTokens(messages: BetaMessageParam[]): number {
  let total = 0
  for (const msg of messages) {
    total += estimateContentTokens(msg.content)
  }
  return total
}

/**
 * Check if conversation needs compaction.
 */
export function needsCompaction(
  messages: BetaMessageParam[],
  model?: string,
): boolean {
  const tokens = estimateTokens(messages)
  return tokens > getEstimatedContextWindow(model) * TOKEN_LIMIT_RATIO
}

/**
 * Compact conversation by keeping system context and last N message pairs.
 * A pair = user message + assistant response.
 */
export function compactMessages(
  messages: BetaMessageParam[],
  keepPairsOrOptions:
    | number
    | {
        keepPairs?: number
        sessionMemorySummary?: string
      } = 3,
): BetaMessageParam[] {
  const options =
    typeof keepPairsOrOptions === 'number'
      ? { keepPairs: keepPairsOrOptions }
      : keepPairsOrOptions
  const keepPairs = options.keepPairs ?? 3
  if (messages.length <= keepPairs * 2) return messages

  const tailSize = Math.min(keepPairs * 2, messages.length - 1)
  let startIndex = Math.max(1, messages.length - tailSize)
  startIndex = adjustStartIndexForToolPairs(messages, startIndex)

  if (startIndex <= 1) {
    return messages
  }

  const removed = messages.slice(1, startIndex)
  const summary =
    buildSessionMemoryCompactionSummary(options.sessionMemorySummary) ||
    generateCompactionSummary(removed)
  const kept = [messages[0]]

  if (summary) {
    kept.push({
      role: 'assistant',
      content: summary,
    })
  }

  kept.push(...messages.slice(startIndex))

  return kept
}

function buildSessionMemoryCompactionSummary(
  summary: string | undefined,
): string {
  if (!summary) return ''

  const normalized = summary.trim()
  if (!normalized) return ''

  return SESSION_MEMORY_COMPACTION_MARKER + '\n' + normalized
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

/**
 * Clear older tool results for high-volume tools without changing the
 * conversation shape. This is a cheap first-pass token reduction that
 * preserves recent tool outputs and the original tool_use/tool_result links.
 */
export function microcompactToolResults(
  messages: BetaMessageParam[],
  options?: {
    triggerThreshold?: number
    keepRecent?: number
  },
): BetaMessageParam[] {
  const triggerThreshold =
    options?.triggerThreshold ?? MICROCOMPACT_TRIGGER_TOOL_RESULTS
  const keepRecent = Math.max(
    1,
    options?.keepRecent ?? MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS,
  )
  const toolNames = getToolUseNameMap(messages)
  const compactableResultIds: string[] = []

  for (const msg of messages) {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) {
      continue
    }

    for (const block of msg.content) {
      if (!isToolResultBlock(block) || block.is_error === true) {
        continue
      }

      const toolName = toolNames.get(block.tool_use_id)
      if (toolName && COMPACTABLE_TOOL_NAMES.has(toolName)) {
        compactableResultIds.push(block.tool_use_id)
      }
    }
  }

  if (compactableResultIds.length <= triggerThreshold) {
    return messages
  }

  const idsToClear = new Set(compactableResultIds.slice(0, -keepRecent))
  let changed = false

  const nextMessages = messages.map(msg => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) {
      return msg
    }

    let messageChanged = false
    const nextContent = msg.content.map(block => {
      if (
        isToolResultBlock(block) &&
        idsToClear.has(block.tool_use_id) &&
        block.is_error !== true &&
        block.content !== MICROCOMPACT_CLEAR_MESSAGE
      ) {
        messageChanged = true
        return {
          ...block,
          content: MICROCOMPACT_CLEAR_MESSAGE,
        }
      }

      return block
    })

    if (!messageChanged) {
      return msg
    }

    changed = true
    return {
      ...msg,
      content: nextContent,
    }
  })

  return changed ? nextMessages : messages
}

export function budgetToolResultOutputs(
  messages: BetaMessageParam[],
  options?: {
    maxTokensPerMessage?: number
    maxTokensPerResult?: number
    maxPreviewChars?: number
  },
): BetaMessageParam[] {
  const maxTokensPerMessage = Math.max(
    1,
    options?.maxTokensPerMessage ?? TOOL_RESULT_MAX_TOKENS_PER_MESSAGE,
  )
  const maxTokensPerResult = Math.max(
    1,
    options?.maxTokensPerResult ?? TOOL_RESULT_MAX_TOKENS_PER_RESULT,
  )
  const maxPreviewChars = Math.max(
    80,
    options?.maxPreviewChars ?? TOOL_RESULT_PREVIEW_MAX_CHARS,
  )
  const toolNames = getToolUseNameMap(messages)
  let changed = false

  const nextMessages = messages.map(message => {
    if (message.role !== 'user' || !Array.isArray(message.content)) {
      return message
    }

    const candidates: ToolResultBudgetCandidate[] = []
    let totalTokens = 0

    for (const [index, block] of message.content.entries()) {
      if (!isToolResultBlock(block) || block.is_error === true) {
        continue
      }

      const toolName = toolNames.get(block.tool_use_id)
      if (!toolName || !COMPACTABLE_TOOL_NAMES.has(toolName)) {
        continue
      }

      const rawContent = stringifyToolResultContent(block.content)
      if (
        !rawContent ||
        rawContent === MICROCOMPACT_CLEAR_MESSAGE ||
        isBudgetedToolResultContent(rawContent)
      ) {
        continue
      }

      const tokens = estimateTextTokens(rawContent)
      totalTokens += tokens

      const preview = buildToolResultPreview(
        toolName,
        rawContent,
        maxPreviewChars,
      )
      candidates.push({
        blockIndex: index,
        toolUseId: block.tool_use_id,
        tokens,
        preview,
        previewTokens: estimateTextTokens(preview),
      })
    }

    if (candidates.length === 0) {
      return message
    }

    const replacements = new Map<number, string>()
    let remainingTokens = totalTokens

    for (const candidate of candidates) {
      if (candidate.tokens <= maxTokensPerResult) {
        continue
      }

      replacements.set(candidate.blockIndex, candidate.preview)
      remainingTokens =
        remainingTokens - candidate.tokens + candidate.previewTokens
    }

    if (remainingTokens > maxTokensPerMessage) {
      const remainingCandidates = candidates
        .filter(candidate => !replacements.has(candidate.blockIndex))
        .sort((left, right) => right.tokens - left.tokens)

      for (const candidate of remainingCandidates) {
        if (remainingTokens <= maxTokensPerMessage) {
          break
        }

        replacements.set(candidate.blockIndex, candidate.preview)
        remainingTokens =
          remainingTokens - candidate.tokens + candidate.previewTokens
      }
    }

    if (replacements.size === 0) {
      return message
    }

    changed = true
    return {
      ...message,
      content: message.content.map((block, index) => {
        if (!isToolResultBlock(block)) {
          return block
        }

        const preview = replacements.get(index)
        if (!preview) {
          return block
        }

        return {
          ...block,
          content: preview,
        }
      }),
    }
  })

  return changed ? nextMessages : messages
}

function stringifyToolResultContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (content === null || content === undefined) {
    return ''
  }

  if (typeof content === 'object') {
    try {
      return JSON.stringify(content)
    } catch {
      return String(content)
    }
  }

  return String(content)
}

function isBudgetedToolResultContent(content: string): boolean {
  return content.startsWith(TOOL_RESULT_BUDGET_PREVIEW_PREFIX)
}

function buildToolResultPreview(
  toolName: string,
  content: string,
  maxPreviewChars: number,
): string {
  const normalized = content.trim() || content
  const previewText = normalized.slice(0, maxPreviewChars).trimEnd()
  const shownChars = previewText.length
  const header =
    TOOL_RESULT_BUDGET_PREVIEW_PREFIX +
    toolName +
    ' result: showing first ' +
    shownChars +
    ' chars of ' +
    normalized.length +
    ']'

  if (shownChars >= normalized.length) {
    return header + '\n' + previewText
  }

  return (
    header + '\n' + previewText + '\n' + TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE
  )
}
