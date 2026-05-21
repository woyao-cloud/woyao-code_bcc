/**
 * Auto-compact system for mini-v5.
 * Manages long conversations by summarizing older messages.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { getMaxTokens } from '../../utils/model/model.js'
import { SESSION_MEMORY_COMPACTION_MARKER } from '../memory/sessionMemory.js'

const COMPACT_BUFFER_LARGE = 50_000 // 800K+ models: keep 50K headroom
const COMPACT_BUFFER_MEDIUM = 30_000 // 400K+ models: keep 30K headroom
const COMPACT_BUFFER_SMALL = 20_000 // 200K+ models: keep 20K headroom
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
export interface ToolResultBudgetState {
  seenToolUseIds: Set<string>
  replacements: Map<string, string>
}

export interface ToolResultBudgetReplacementRecord {
  kind: 'tool-result'
  toolUseId: string
  replacement: string
}

interface ToolResultBudgetCandidate {
  tokens: number
  preview: string
  previewTokens: number
  toolName: string
  toolUseId: string
}

interface ToolResultBudgetCandidateGroup {
  candidates: ToolResultBudgetCandidate[]
}

interface ToolResultBudgetApplyResult {
  didBudgetToolResults: boolean
  messages: BetaMessageParam[]
  newlyReplaced: ToolResultBudgetReplacementRecord[]
}

interface ToolResultBudgetOptions {
  maxTokensPerMessage?: number
  maxTokensPerResult?: number
  maxPreviewChars?: number
}

interface ToolResultBudgetPartition {
  fresh: ToolResultBudgetCandidate[]
  frozen: ToolResultBudgetCandidate[]
  mustReapply: Array<
    ToolResultBudgetCandidate & {
      replacement: string
      replacementTokens: number
    }
  >
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

export function getCompactBuffer(model?: string): number {
  const maxTokens = getEstimatedContextWindow(model)
  if (maxTokens >= 800_000) return COMPACT_BUFFER_LARGE
  if (maxTokens >= 400_000) return COMPACT_BUFFER_MEDIUM
  if (maxTokens >= 200_000) return COMPACT_BUFFER_SMALL
  // For smaller / unknown models, use proportional buffer (~30% of window)
  // so compaction triggers at ~70% of context, matching the original heuristic
  return Math.max(5000, Math.floor(maxTokens * 0.3))
}

export function getEstimatedContextWindow(model?: string): number {
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
  const window = getEstimatedContextWindow(model)
  const buffer = getCompactBuffer(model)
  return tokens > window - buffer
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
 * Generate a semantic compaction summary for the removed messages.
 * Extracts user intents, tool usage, and assistant decisions.
 */
export function generateCompactionSummary(removed: BetaMessageParam[]): string {
  if (removed.length === 0) return ''

  const userMessages = removed.filter(m => m.role === 'user')
  const assistantMessages = removed.filter(m => m.role === 'assistant')

  // Collect unique tool names used in removed span
  const toolCalls = new Set<string>()
  for (const msg of removed) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue
    for (const block of msg.content) {
      if (isToolUseBlock(block)) toolCalls.add(block.name)
    }
  }

  // Extract user intents: last 4 user messages, first 200 chars each
  const intents = userMessages
    .slice(-4)
    .map(m => {
      const content = typeof m.content === 'string' ? m.content : ''
      return content.slice(0, 200).trim()
    })
    .filter(Boolean)

  // Extract assistant decisions: sentences with decision keywords
  const decisions = assistantMessages
    .slice(-3)
    .map(m => {
      const text = typeof m.content === 'string' ? m.content : ''
      const match = text.match(/(?:I'?ll|Let's|We should|The plan is)[^.]*\./gi)
      return match ? match.slice(0, 2).join('; ') : ''
    })
    .filter(Boolean)

  const parts: string[] = [
    `[Compacted ${removed.length} messages:`,
    `${userMessages.length} user requests, ${assistantMessages.length} assistant responses`,
  ]

  if (toolCalls.size > 0) {
    parts.push(`tools: ${[...toolCalls].join(', ')}`)
  }

  if (intents.length > 0) {
    parts.push(`requests: ${intents.join(' | ')}`)
  }

  if (decisions.length > 0) {
    parts.push(`decisions: ${decisions.join(' | ')}`)
  }

  parts.push(']')
  return parts.join('\n')
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
    positionThreshold?: number
  },
): BetaMessageParam[] {
  const triggerThreshold =
    options?.triggerThreshold ?? MICROCOMPACT_TRIGGER_TOOL_RESULTS
  const keepRecent = Math.max(
    1,
    options?.keepRecent ?? MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS,
  )
  const positionThreshold = options?.positionThreshold
  const toolNames = getToolUseNameMap(messages)

  // Collect compactable IDs and track which message each belongs to
  const compactableResultIds: string[] = []
  const idToMessageIndex = new Map<string, number>()

  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi]
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
        idToMessageIndex.set(block.tool_use_id, mi)
      }
    }
  }

  // Determine which IDs to clear via count-based and/or position-based logic
  const idsToClear = new Set<string>()

  // Count-based: only if above trigger threshold, keep the most recent results
  if (compactableResultIds.length > triggerThreshold) {
    for (const id of compactableResultIds.slice(0, -keepRecent)) {
      idsToClear.add(id)
    }
  }

  // Position-based: compact tool results from messages older than positionThreshold
  if (positionThreshold !== undefined && positionThreshold > 0) {
    const ageCutoff = messages.length - positionThreshold
    for (const [id, mi] of idToMessageIndex) {
      if (mi < ageCutoff) {
        idsToClear.add(id)
      }
    }
  }

  if (idsToClear.size === 0) {
    return messages
  }

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

export function createToolResultBudgetState(): ToolResultBudgetState {
  return {
    seenToolUseIds: new Set<string>(),
    replacements: new Map<string, string>(),
  }
}

export function serializeToolResultBudgetState(
  state: ToolResultBudgetState,
): ToolResultBudgetReplacementRecord[] {
  return Array.from(state.replacements.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([toolUseId, replacement]) => ({
      kind: 'tool-result',
      toolUseId,
      replacement,
    }))
}

export function reconstructToolResultBudgetState(
  messages: BetaMessageParam[],
  records: ToolResultBudgetReplacementRecord[],
  inheritedReplacements?: ReadonlyMap<string, string>,
): ToolResultBudgetState {
  const state = createToolResultBudgetState()
  const toolNames = getToolUseNameMap(messages)
  const candidateGroups = collectBudgetCandidateGroups(
    messages,
    toolNames,
    TOOL_RESULT_PREVIEW_MAX_CHARS,
  )
  const candidateIds = new Set(
    candidateGroups.flatMap(group =>
      group.candidates.map(candidate => candidate.toolUseId),
    ),
  )

  for (const toolUseId of candidateIds) {
    state.seenToolUseIds.add(toolUseId)
  }

  for (const record of records) {
    if (candidateIds.has(record.toolUseId)) {
      state.replacements.set(record.toolUseId, record.replacement)
    }
  }

  if (inheritedReplacements) {
    for (const [toolUseId, replacement] of inheritedReplacements.entries()) {
      if (candidateIds.has(toolUseId) && !state.replacements.has(toolUseId)) {
        state.replacements.set(toolUseId, replacement)
      }
    }
  }

  return state
}

export function getToolResultBudgetReplacementMap(
  state: ToolResultBudgetState,
): ReadonlyMap<string, string> {
  return state.replacements
}

export function budgetToolResultOutputs(
  messages: BetaMessageParam[],
  options?: ToolResultBudgetOptions,
): BetaMessageParam[] {
  const result = applyToolResultBudget(
    messages,
    createToolResultBudgetState(),
    options,
  )
  return result.messages
}

export function applyToolResultBudget(
  messages: BetaMessageParam[],
  state: ToolResultBudgetState,
  options?: ToolResultBudgetOptions,
): ToolResultBudgetApplyResult {
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
  const candidateGroups = collectBudgetCandidateGroups(
    messages,
    toolNames,
    maxPreviewChars,
  )
  const replacementMap = new Map<string, string>()
  const newlyReplaced: ToolResultBudgetReplacementRecord[] = []

  for (const group of candidateGroups) {
    const partition = partitionBudgetCandidates(group.candidates, state)
    const selected = selectFreshCandidatesToReplace(
      partition,
      maxTokensPerMessage,
      maxTokensPerResult,
    )

    for (const candidate of partition.mustReapply) {
      replacementMap.set(candidate.toolUseId, candidate.replacement)
    }
    for (const candidate of selected) {
      replacementMap.set(candidate.toolUseId, candidate.preview)
      if (!state.replacements.has(candidate.toolUseId)) {
        state.replacements.set(candidate.toolUseId, candidate.preview)
        newlyReplaced.push({
          kind: 'tool-result',
          toolUseId: candidate.toolUseId,
          replacement: candidate.preview,
        })
      }
    }
    for (const candidate of group.candidates) {
      state.seenToolUseIds.add(candidate.toolUseId)
    }
  }

  if (replacementMap.size === 0) {
    return {
      messages,
      didBudgetToolResults: false,
      newlyReplaced,
    }
  }

  return {
    messages: replaceToolResultContents(messages, replacementMap),
    didBudgetToolResults: true,
    newlyReplaced,
  }
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

function collectBudgetCandidateGroups(
  messages: BetaMessageParam[],
  toolNames: Map<string, string>,
  maxPreviewChars: number,
): ToolResultBudgetCandidateGroup[] {
  const groups: ToolResultBudgetCandidateGroup[] = []

  for (const message of messages) {
    const candidates = collectBudgetCandidatesFromMessage(
      message,
      toolNames,
      maxPreviewChars,
    )
    if (candidates.length === 0) {
      continue
    }
    groups.push({ candidates })
  }

  return groups
}

function collectBudgetCandidatesFromMessage(
  message: BetaMessageParam,
  toolNames: Map<string, string>,
  maxPreviewChars: number,
): ToolResultBudgetCandidate[] {
  if (message.role !== 'user' || !Array.isArray(message.content)) {
    return []
  }

  const candidates: ToolResultBudgetCandidate[] = []
  for (const block of message.content) {
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

    const preview = buildToolResultPreview(
      toolName,
      rawContent,
      maxPreviewChars,
    )
    candidates.push({
      toolUseId: block.tool_use_id,
      toolName,
      tokens: estimateTextTokens(rawContent),
      preview,
      previewTokens: estimateTextTokens(preview),
    })
  }

  return candidates
}

function partitionBudgetCandidates(
  candidates: ToolResultBudgetCandidate[],
  state: ToolResultBudgetState,
): ToolResultBudgetPartition {
  return candidates.reduce<ToolResultBudgetPartition>(
    (acc, candidate) => {
      const replacement = state.replacements.get(candidate.toolUseId)
      if (replacement !== undefined) {
        acc.mustReapply.push({
          ...candidate,
          replacement,
          replacementTokens: estimateTextTokens(replacement),
        })
      } else if (state.seenToolUseIds.has(candidate.toolUseId)) {
        acc.frozen.push(candidate)
      } else {
        acc.fresh.push(candidate)
      }
      return acc
    },
    {
      fresh: [],
      frozen: [],
      mustReapply: [],
    },
  )
}

function selectFreshCandidatesToReplace(
  partition: ToolResultBudgetPartition,
  maxTokensPerMessage: number,
  maxTokensPerResult: number,
): ToolResultBudgetCandidate[] {
  const selected = new Set<string>()
  let visibleTokens =
    partition.frozen.reduce((sum, candidate) => sum + candidate.tokens, 0) +
    partition.fresh.reduce((sum, candidate) => sum + candidate.tokens, 0) +
    partition.mustReapply.reduce(
      (sum, candidate) => sum + candidate.replacementTokens,
      0,
    )

  const oversizeFresh = partition.fresh
    .filter(candidate => candidate.tokens > maxTokensPerResult)
    .sort((left, right) => right.tokens - left.tokens)

  for (const candidate of oversizeFresh) {
    if (selected.has(candidate.toolUseId)) {
      continue
    }
    selected.add(candidate.toolUseId)
    visibleTokens = visibleTokens - candidate.tokens + candidate.previewTokens
  }

  if (visibleTokens > maxTokensPerMessage) {
    const remainingFresh = partition.fresh
      .filter(candidate => !selected.has(candidate.toolUseId))
      .sort((left, right) => right.tokens - left.tokens)

    for (const candidate of remainingFresh) {
      if (visibleTokens <= maxTokensPerMessage) {
        break
      }
      selected.add(candidate.toolUseId)
      visibleTokens = visibleTokens - candidate.tokens + candidate.previewTokens
    }
  }

  return partition.fresh.filter(candidate => selected.has(candidate.toolUseId))
}

function replaceToolResultContents(
  messages: BetaMessageParam[],
  replacementMap: ReadonlyMap<string, string>,
): BetaMessageParam[] {
  let changed = false

  const nextMessages = messages.map(message => {
    if (message.role !== 'user' || !Array.isArray(message.content)) {
      return message
    }

    let messageChanged = false
    const nextContent = message.content.map(block => {
      if (!isToolResultBlock(block)) {
        return block
      }

      const replacement = replacementMap.get(block.tool_use_id)
      if (replacement === undefined) {
        return block
      }

      messageChanged = true
      return {
        ...block,
        content: replacement,
      }
    })

    if (!messageChanged) {
      return message
    }

    changed = true
    return {
      ...message,
      content: nextContent,
    }
  })

  return changed ? nextMessages : messages
}
