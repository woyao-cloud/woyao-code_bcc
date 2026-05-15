import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
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
}

export interface CreateConversationBuffersOptions {
  forceCompactNextProjection?: boolean
  inheritedToolResultReplacements?: ReadonlyMap<string, string>
  restoreToolResultBudgetState?: boolean
  toolResultBudgetRecords?: ToolResultBudgetReplacementRecord[]
}

export interface ConversationBuffersSnapshot {
  forceCompactNextProjection: boolean
  fullMessages: BetaMessageParam[]
  toolResultBudgetRecords: ToolResultBudgetReplacementRecord[]
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
    fullMessages: [...conversation.fullMessages],
    forceCompactNextProjection: conversation.forceCompactNextProjection,
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
  const sourceMessages = [...fullMessages]
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
    const sessionMemorySummary = getSessionMemorySummaryForCompact(fullMessages)
    const compacted = compactMessages(messagesForAPI, {
      sessionMemorySummary,
    })
    didCompact = compacted !== messagesForAPI
    messagesForAPI = compacted
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
