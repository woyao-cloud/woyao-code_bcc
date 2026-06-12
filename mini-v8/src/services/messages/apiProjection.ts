import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from '../../utils/crypto.js'
import {
  applyToolResultBudget,
  compactMessages,
  createToolResultBudgetState,
  estimateTokens,
  getEstimatedContextWindow,
  getToolResultBudgetReplacementMap,
  needsCompaction,
  reconstructToolResultBudgetState,
  serializeToolResultBudgetState,
  type ToolResultBudgetReplacementRecord,
  type ToolResultBudgetState,
} from '../compact/autoCompact.js'
import {
  getSessionMemorySummaryForCompact,
  setLastSummarizedMessageId,
} from '../memory/sessionMemory.js'
import {
  trySessionMemoryCompaction,
  getMessageFingerprint,
} from '../compact/sessionMemoryCompact.js'
import { invalidateSystemContextCache } from '../context/contextCacheState.js'
import { restorePersistedToolResult } from '../toolResultStorage.js'
import {
  projectSnippedView,
  type SnipEntry,
} from '../compact/snipProjection.js'
import {
  createCachedMCState,
  getMicrocompactWithCache,
} from '../compact/cachedMicrocompact.js'

// Module-level cached microcompact state (auto-registered for cleanup)
const cachedMCState = createCachedMCState()

export interface ConversationBuffers {
  fullMessages: BetaMessageParam[]
  messageUuids: string[]
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
  /** Fingerprint of the last message compacted — used to resume boundary tracking */
  lastSummarizedMessageId?: string
}

export interface APIMessageProjection {
  messagesForAPI: BetaMessageParam[]
  didMicrocompact: boolean
  didBudgetToolResults: boolean
  didCompact: boolean
  estimatedTokens: number
  estimatedHeadroom: number
  headroomRatio: number
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
  messageUuids: string[]
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
    messageUuids: initialMessages.map(() => randomUUID()),
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

/**
 * Push a message to the conversation buffers, auto-generating a UUID.
 * Returns the generated UUID.
 */
export function pushMessageWithUuid(
  buffers: ConversationBuffers,
  msg: BetaMessageParam,
): string {
  const uuid = randomUUID()
  buffers.fullMessages.push(msg)
  buffers.messageUuids.push(uuid)
  return uuid
}

/**
 * Convert conversation buffers to SnipEntry[] for snip processing.
 */
export function toSnipEntries(buffers: ConversationBuffers): SnipEntry[] {
  const entries: SnipEntry[] = []
  for (let i = 0; i < buffers.fullMessages.length; i++) {
    entries.push({
      msg: buffers.fullMessages[i],
      uuid: buffers.messageUuids[i] ?? randomUUID(),
    })
  }
  return entries
}

/**
 * Apply snip result back to conversation buffers (replace messages + uuids).
 */
export function applySnipToBuffers(
  buffers: ConversationBuffers,
  entries: SnipEntry[],
): void {
  buffers.fullMessages.length = 0
  buffers.messageUuids.length = 0
  for (const entry of entries) {
    buffers.fullMessages.push(entry.msg)
    buffers.messageUuids.push(entry.uuid)
  }
}

export function serializeConversationBuffers(
  conversation: ConversationBuffers,
): ConversationBuffersSnapshot {
  return {
    fullMessages: cloneMessages(conversation.fullMessages),
    messageUuids: [...conversation.messageUuids],
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
  conversation.messageUuids.length = 0
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

  // Build SnipEntry[] from activeMessages, aligning UUIDs with fullMessages
  let snipOffset = 0
  if (conversation) {
    snipOffset = fullMessages.length - conversation.messageUuids.length
  }
  const snipEntries: SnipEntry[] = []
  for (let i = 0; i < activeMessages.length; i++) {
    const uuidIdx = snipOffset + i
    snipEntries.push({
      msg: activeMessages[i],
      uuid:
        conversation && uuidIdx < conversation.messageUuids.length
          ? conversation.messageUuids[uuidIdx]
          : randomUUID(),
    })
  }

  const sourceMessages = cloneMessages(activeMessages)
  let messagesForAPI = sourceMessages

  // Apply snip projection: filter out messages marked by snip_boundary
  if (conversation) {
    const snipped = projectSnippedView(snipEntries)
    if (snipped.length !== activeMessages.length) {
      messagesForAPI = snipped.map(e => cloneMessages([e.msg])[0])
    }
  }

  // Restore persisted tool results from disk before projection
  messagesForAPI = messagesForAPI.map(msg => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg
    let changed = false
    const nextContent = msg.content.map(block => {
      if (
        typeof block === 'object' &&
        block !== null &&
        (block as Record<string, unknown>).type === 'tool_result'
      ) {
        const tr = block as Record<string, unknown>
        if (typeof tr.content === 'string') {
          const restored = restorePersistedToolResult(tr.content)
          if (restored !== tr.content) {
            changed = true
            return { ...tr, content: restored }
          }
        }
      }
      return block
    })
    return changed ? { ...msg, content: nextContent } : msg
  })

  const microcompacted = getMicrocompactWithCache(
    cachedMCState,
    messagesForAPI,
    {
      positionThreshold: 10,
    },
  )
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
    // Try session memory compaction first (token-aware boundary + persisted notes)
    const smResult = trySessionMemoryCompaction(messagesForAPI)
    if (smResult) {
      didCompact = true

      // Compute fingerprint of the last compacted message for boundary tracking
      // (must use original messagesForAPI before reassignment)
      const lastCompactMsg = messagesForAPI[smResult.keptStartIndex - 1]
      const fingerprint = lastCompactMsg
        ? getMessageFingerprint(lastCompactMsg)
        : undefined

      messagesForAPI = smResult.messages

      if (conversation && options.commitCompactionToConversation) {
        commitCompactedProjectionToConversation(
          conversation,
          fullMessages,
          activeMessages,
          smResult.messages,
          smResult.summaryText,
          fingerprint,
        )
      }
    } else {
      // Fall back to existing heuristic compaction
      const sessionMemorySummary =
        getSessionMemorySummaryForCompact(activeMessages)
      const compacted = compactMessages(messagesForAPI, {
        sessionMemorySummary,
      })
      didCompact = compacted !== messagesForAPI
      messagesForAPI = compacted

      if (
        didCompact &&
        conversation &&
        options.commitCompactionToConversation
      ) {
        commitCompactedProjectionToConversation(
          conversation,
          fullMessages,
          activeMessages,
          compacted,
          sessionMemorySummary,
        )
      }
    }
  }

  const estimatedTokens = estimateTokens(messagesForAPI)
  const window = getEstimatedContextWindow(options.model)
  const estimatedHeadroom = Math.max(0, window - estimatedTokens)
  const headroomRatio = window > 0 ? estimatedHeadroom / window : 0

  return {
    messagesForAPI,
    didMicrocompact,
    didBudgetToolResults,
    didCompact,
    estimatedTokens,
    estimatedHeadroom,
    headroomRatio,
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
  lastSummarizedMessageId?: string,
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
    lastSummarizedMessageId,
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
  lastSummarizedMessageId?: string,
): CompactBoundaryMetadata {
  const summaryMessage = compactedMessages.find(
    message =>
      message.role === 'assistant' &&
      typeof message.content === 'string' &&
      message.content.includes('Compacted'),
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
    lastSummarizedMessageId,
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

/**
 * Restore lastSummarizedMessageId from the last CompactBoundaryMetadata.
 * Called on session resume to continue boundary tracking across compaction cycles.
 */
export function restoreLastSummarizedMessageIdFromBoundaries(
  boundaries: CompactBoundaryMetadata[] | undefined,
): void {
  if (!boundaries || boundaries.length === 0) return

  const lastBoundary = boundaries[boundaries.length - 1]
  if (lastBoundary?.lastSummarizedMessageId) {
    setLastSummarizedMessageId(lastBoundary.lastSummarizedMessageId)
  }
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
