import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from '../../utils/crypto.js'
import {
  applyToolResultBudget,
  compactMessages,
  createToolResultBudgetState,
  estimateTokens,
  getToolResultBudgetReplacementMap,
  microcompactToolResults,
  needsCompaction,
  reconstructToolResultBudgetState,
  serializeToolResultBudgetState,
  type ToolResultBudgetReplacementRecord,
  type ToolResultBudgetState,
} from '../compact/autoCompact.js'
import { getSessionMemorySummaryForCompact } from '../memory/sessionMemory.js'
import { invalidateSystemContextCache } from '../context/contextCacheState.js'

export interface ConversationBuffers {
  fullMessages: BetaMessageParam[]
  forceCompactNextProjection: boolean
  toolResultBudgetState: ToolResultBudgetState
  compactBoundaries: CompactBoundaryMetadata[]
}

export interface CompactBoundaryMetadata {
  id: string
  timestamp: string
  sourceMessageCount: number
  projectedMessageCount: number
  preservedTailCount: number
  sessionMemoryCompacted: boolean
  summaryPreview: string
}

export interface APIMessageProjection {
  messagesForAPI: BetaMessageParam[]
  didMicrocompact: boolean
  didBudgetToolResults: boolean
  didCompact: boolean
  estimatedTokens: number
  sourceMessageCount: number
  projectedMessageCount: number
}

export interface APIProjectionOptions {
  model?: string
  forceCompact?: boolean
  commitCompactionToConversation?: boolean
}

export interface CreateConversationBuffersOptions {
  forceCompactNextProjection?: boolean
  inheritedToolResultReplacements?: ReadonlyMap<string, string>
  restoreToolResultBudgetState?: boolean
  toolResultBudgetRecords?: ToolResultBudgetReplacementRecord[]
  compactBoundaries?: CompactBoundaryMetadata[]
}

export interface ConversationBuffersSnapshot {
  forceCompactNextProjection: boolean
  fullMessages: BetaMessageParam[]
  toolResultBudgetRecords: ToolResultBudgetReplacementRecord[]
  compactBoundaries: CompactBoundaryMetadata[]
}

export function createConversationBuffers(
  initialMessages: BetaMessageParam[] = [],
  options: CreateConversationBuffersOptions = {},
): ConversationBuffers {
  const hasRecords = (options.toolResultBudgetRecords?.length ?? 0) > 0
  const hasInheritedReplacements =
    options.inheritedToolResultReplacements !== undefined
  const shouldRestoreToolResultBudgetState =
    options.restoreToolResultBudgetState ??
    (hasRecords || hasInheritedReplacements)

  return {
    fullMessages: [...initialMessages],
    forceCompactNextProjection: options.forceCompactNextProjection ?? false,
    compactBoundaries: options.compactBoundaries
      ? options.compactBoundaries.map(boundary => ({ ...boundary }))
      : [],
    toolResultBudgetState: shouldRestoreToolResultBudgetState
      ? reconstructToolResultBudgetState(
          initialMessages,
          options.toolResultBudgetRecords ?? [],
          options.inheritedToolResultReplacements,
        )
      : createToolResultBudgetState(),
  }
}

export function serializeConversationBuffers(
  conversation: ConversationBuffers,
): ConversationBuffersSnapshot {
  return {
    fullMessages: cloneMessages(conversation.fullMessages),
    forceCompactNextProjection: conversation.forceCompactNextProjection,
    compactBoundaries: conversation.compactBoundaries.map(boundary => ({
      ...boundary,
    })),
    toolResultBudgetRecords: serializeToolResultBudgetState(
      conversation.toolResultBudgetState,
    ),
  }
}

export function clearConversationBuffers(
  conversation: ConversationBuffers,
): void {
  conversation.fullMessages.length = 0
  conversation.forceCompactNextProjection = false
  conversation.toolResultBudgetState = createToolResultBudgetState()
  conversation.compactBoundaries = []
  invalidateSystemContextCache()
}

export function requestForcedCompaction(
  conversation: ConversationBuffers,
): void {
  conversation.forceCompactNextProjection = true
  invalidateSystemContextCache()
}

export function consumeForcedCompaction(
  conversation: ConversationBuffers,
): boolean {
  const forceCompact = conversation.forceCompactNextProjection
  conversation.forceCompactNextProjection = false
  return forceCompact
}

export function projectMessagesForAPI(
  source: ConversationBuffers | BetaMessageParam[],
  options: APIProjectionOptions = {},
): APIMessageProjection {
  let conversation: ConversationBuffers | undefined
  let fullMessages: BetaMessageParam[]
  if (isConversationBuffers(source)) {
    conversation = source
    fullMessages = conversation.fullMessages
  } else {
    fullMessages = source
  }
  const activeMessages = getMessagesForProjection(
    fullMessages,
    conversation?.compactBoundaries,
  )
  const sourceMessages = cloneMessages(activeMessages)
  let messagesForAPI = sourceMessages

  const microcompacted = microcompactToolResults(messagesForAPI)
  const didMicrocompact = microcompacted !== messagesForAPI
  messagesForAPI = microcompacted

  const budgetState =
    conversation?.toolResultBudgetState ?? createToolResultBudgetState()
  const budgetResult = applyToolResultBudget(messagesForAPI, budgetState)
  const didBudgetToolResults = budgetResult.didBudgetToolResults
  messagesForAPI = budgetResult.messages

  const shouldCompact =
    options.forceCompact === true ||
    needsCompaction(messagesForAPI, options.model)

  let didCompact = false
  if (shouldCompact) {
    const sessionMemorySummary =
      getSessionMemorySummaryForCompact(activeMessages)
    const compacted = compactMessages(messagesForAPI, {
      sessionMemorySummary,
    })
    didCompact = compacted !== messagesForAPI
    messagesForAPI = compacted

    if (didCompact && conversation && options.commitCompactionToConversation) {
      commitCompactedProjectionToConversation(
        conversation,
        fullMessages,
        activeMessages,
        compacted,
        sessionMemorySummary,
      )
    }
  }

  return {
    messagesForAPI,
    didMicrocompact,
    didBudgetToolResults,
    didCompact,
    estimatedTokens: estimateTokens(messagesForAPI),
    sourceMessageCount: fullMessages.length,
    projectedMessageCount: messagesForAPI.length,
  }
}

export function getConversationToolResultReplacements(
  conversation: ConversationBuffers,
): ReadonlyMap<string, string> {
  return getToolResultBudgetReplacementMap(conversation.toolResultBudgetState)
}

function isConversationBuffers(
  value: ConversationBuffers | BetaMessageParam[],
): value is ConversationBuffers {
  return !Array.isArray(value)
}

function getMessagesForProjection(
  messages: BetaMessageParam[],
  boundaries?: CompactBoundaryMetadata[],
): BetaMessageParam[] {
  const boundaryIndex = findLastCompactBoundaryIndex(messages, boundaries)
  if (boundaryIndex === -1) {
    return messages
  }

  return messages.slice(boundaryIndex + 1)
}

function findLastCompactBoundaryIndex(
  messages: BetaMessageParam[],
  boundaries?: CompactBoundaryMetadata[],
): number {
  if (!boundaries || boundaries.length === 0) {
    return -1
  }

  const lastBoundary = boundaries[boundaries.length - 1]
  if (!lastBoundary) {
    return -1
  }

  return Math.max(
    -1,
    messages.length - Math.max(0, lastBoundary.projectedMessageCount),
  )
}

function commitCompactedProjectionToConversation(
  conversation: ConversationBuffers,
  fullMessages: BetaMessageParam[],
  activeMessages: BetaMessageParam[],
  compactedMessages: BetaMessageParam[],
  sessionMemorySummary: string,
): void {
  const previousBoundaryIndex = findLastCompactBoundaryIndex(
    fullMessages,
    conversation.compactBoundaries,
  )
  const preservedPrefix =
    previousBoundaryIndex === -1
      ? []
      : cloneMessages(fullMessages.slice(0, previousBoundaryIndex + 1))
  const compactBoundary = buildCompactBoundaryMetadata(
    activeMessages,
    compactedMessages,
    sessionMemorySummary,
  )
  const committedActiveSlice = buildCommittedActiveSlice(compactedMessages)

  conversation.fullMessages = [...preservedPrefix, ...committedActiveSlice]
  conversation.compactBoundaries = [
    ...conversation.compactBoundaries,
    compactBoundary,
  ]
  conversation.toolResultBudgetState = reconstructToolResultBudgetState(
    getMessagesForProjection(
      conversation.fullMessages,
      conversation.compactBoundaries,
    ),
    serializeToolResultBudgetState(conversation.toolResultBudgetState),
  )
  conversation.forceCompactNextProjection = false
  invalidateSystemContextCache()
}

function buildCompactBoundaryMetadata(
  sourceMessages: BetaMessageParam[],
  compactedMessages: BetaMessageParam[],
  sessionMemorySummary: string,
): CompactBoundaryMetadata {
  const summaryMessage = compactedMessages.find(
    message =>
      message.role === 'assistant' &&
      typeof message.content === 'string' &&
      message.content.includes('Earlier conversation'),
  )
  const summaryPreview =
    typeof summaryMessage?.content === 'string'
      ? summaryMessage.content.slice(0, 240)
      : ''

  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    sourceMessageCount: sourceMessages.length,
    projectedMessageCount: compactedMessages.length,
    preservedTailCount: Math.max(0, compactedMessages.length - 2),
    sessionMemoryCompacted: Boolean(sessionMemorySummary.trim()),
    summaryPreview,
  }
}

function buildCommittedActiveSlice(
  compactedMessages: BetaMessageParam[],
): BetaMessageParam[] {
  if (compactedMessages.length <= 1) {
    return cloneMessages(compactedMessages)
  }

  const [, ...rest] = compactedMessages
  return cloneMessages(rest)
}

function cloneMessages(messages: BetaMessageParam[]): BetaMessageParam[] {
  return messages.map(message => {
    if (typeof message.content === 'string') {
      return { ...message }
    }

    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map(block =>
          typeof block === 'object' && block !== null ? { ...block } : block,
        ),
      }
    }

    return { ...message }
  })
}
