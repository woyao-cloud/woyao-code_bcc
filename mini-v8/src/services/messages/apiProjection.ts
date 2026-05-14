import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  compactMessages,
  estimateTokens,
  microcompactToolResults,
  needsCompaction,
} from '../compact/autoCompact.js'
import { getSessionMemorySummaryForCompact } from '../memory/sessionMemory.js'

export interface ConversationBuffers {
  fullMessages: BetaMessageParam[]
  forceCompactNextProjection: boolean
}

export interface APIMessageProjection {
  messagesForAPI: BetaMessageParam[]
  didMicrocompact: boolean
  didCompact: boolean
  estimatedTokens: number
  sourceMessageCount: number
  projectedMessageCount: number
}

export interface APIProjectionOptions {
  model?: string
  forceCompact?: boolean
}

export function createConversationBuffers(
  initialMessages: BetaMessageParam[] = [],
): ConversationBuffers {
  return {
    fullMessages: [...initialMessages],
    forceCompactNextProjection: false,
  }
}

export function clearConversationBuffers(
  conversation: ConversationBuffers,
): void {
  conversation.fullMessages.length = 0
  conversation.forceCompactNextProjection = false
}

export function requestForcedCompaction(
  conversation: ConversationBuffers,
): void {
  conversation.forceCompactNextProjection = true
}

export function consumeForcedCompaction(
  conversation: ConversationBuffers,
): boolean {
  const forceCompact = conversation.forceCompactNextProjection
  conversation.forceCompactNextProjection = false
  return forceCompact
}

export function projectMessagesForAPI(
  fullMessages: BetaMessageParam[],
  options: APIProjectionOptions = {},
): APIMessageProjection {
  const sourceMessages = [...fullMessages]
  let messagesForAPI = sourceMessages

  const microcompacted = microcompactToolResults(messagesForAPI)
  const didMicrocompact = microcompacted !== messagesForAPI
  messagesForAPI = microcompacted

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
    didCompact,
    estimatedTokens: estimateTokens(messagesForAPI),
    sourceMessageCount: fullMessages.length,
    projectedMessageCount: messagesForAPI.length,
  }
}
