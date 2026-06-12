import { streamClaudeAPI } from './services/api/claude.js'
import { resolveModel } from './utils/model/model.js'
import { getPermissionMode } from './utils/settings/settings.js'
import { requestPermission } from './services/permission/permissionManager.js'
import { withRetry, isRetryableError } from './services/retry.js'
import { logError } from './utils/log.js'
import { createDefaultTurnLimitManager } from './utils/turnLimit.js'
import {
  projectMessagesForAPI,
  createConversationBuffers,
  type ConversationBuffers,
} from './services/messages/apiProjection.js'
import { createToolResultBudgetState } from './services/compact/autoCompact.js'
import { runPostCompactCleanup } from './services/compact/postCompactCleanup.js'
import {
  reactiveCompact,
  isPromptTooLongError,
} from './services/compact/reactiveCompact.js'
import { getSystemContext } from './context.js'
import { getCwd } from './bootstrap/state.js'
import type { Tool, ToolUseContext, ToolResult } from './Tool.js'
import type { ContentItem } from './types/message.js'
import type {
  BetaMessageParam,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { QueryEvent } from './query/transitions.js'
import { persistLargeToolResult } from './services/toolResultStorage.js'
import {
  orchestrateToolExecution,
  buildOrchestratedToolUses,
} from './services/tools/toolOrchestration.js'

export interface QueryOptions {
  model?: string
  maxTurns?: number
  abortSignal?: AbortSignal
  isInteractive?: boolean
  canUseTool?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => Promise<boolean>
  getCwd?: () => string
  onSystemContext?: (messages: BetaMessageParam[]) => Promise<string>
}

export async function* query(
  systemPrompt: string,
  messages: BetaMessageParam[],
  tools: Tool[],
  options: QueryOptions = {},
): AsyncGenerator<QueryEvent> {
  const cwd = options.getCwd?.() ?? getCwd()
  const toolsMap = new Map(tools.map(t => [t.name, t]))
  const turnLimitManager = createDefaultTurnLimitManager(options.maxTurns ?? 50)
  let totalInputTokens = 0
  let totalOutputTokens = 0

  const conversation: ConversationBuffers = createConversationBuffers(messages)
  let hasAttemptedReactiveCompact = false
  let recoveryCount = 0
  const DEFAULT_MAX_TOKENS = 32000
  const ESCALATED_MAX_TOKENS = 64000

  while (true) {
    const turnResult = turnLimitManager.increment()
    if (!turnResult.shouldContinue) {
      yield {
        type: 'terminal',
        reason: 'max_turns',
        turnCount: turnLimitManager.getTurnCount(),
        totalInputTokens,
        totalOutputTokens,
      }
      return
    }

    const activeModel = options.model ?? resolveModel()
    const { messagesForAPI } = projectMessagesForAPI(conversation, {
      model: activeModel,
      commitCompactionToConversation: true,
    })

    const systemCtx = options.onSystemContext
      ? await options.onSystemContext(messagesForAPI)
      : await getSystemContext(undefined, {
          conversationMessages: messagesForAPI,
          sessionMemoryMode: 'auto',
        })

    const fullSystemPrompt = `${systemPrompt}\n\n${systemCtx}`

    const toolUses: Array<{
      id: string
      name: string
      input: Record<string, unknown>
    }> = []
    const contentBlocks: Array<
      | { type: 'text'; text: string }
      | {
          type: 'tool_use'
          id: string
          name: string
          input: Record<string, unknown>
        }
    > = []
    const textDeltas: string[] = []
    let fullText = ''
    let streamComplete = false
    let stopReason: string | null = null

    try {
      await withRetry(
        async () => {
          const stream = streamClaudeAPI({
            messages: messagesForAPI,
            systemPrompt: fullSystemPrompt,
            tools,
            model: activeModel,
            maxTokens:
              recoveryCount > 0 ? ESCALATED_MAX_TOKENS : DEFAULT_MAX_TOKENS,
          })

          for await (const event of stream) {
            if (options.abortSignal?.aborted) break
            const evt = event as BetaRawMessageStreamEvent
            switch (evt.type) {
              case 'content_block_start': {
                const block = evt.content_block
                if (block.type === 'tool_use') {
                  const tu = {
                    id: block.id,
                    name: block.name,
                    input: (block.input as Record<string, unknown>) || {},
                  }
                  toolUses.push(tu)
                  contentBlocks.push({
                    type: 'tool_use',
                    id: tu.id,
                    name: tu.name,
                    input: tu.input,
                  })
                } else if (block.type === 'text') {
                  contentBlocks.push({ type: 'text', text: '' })
                }
                break
              }
              case 'content_block_delta': {
                const delta = evt.delta
                if (delta.type === 'text_delta') {
                  const lb = contentBlocks[contentBlocks.length - 1]
                  if (lb && lb.type === 'text') {
                    lb.text += delta.text
                    fullText += delta.text
                    textDeltas.push(delta.text)
                  }
                } else if (delta.type === 'input_json_delta') {
                  const lt = toolUses[toolUses.length - 1]
                  if (lt) {
                    lt.input = {
                      ...lt.input,
                      ...safeJsonMerge(lt.input, delta.partial_json),
                    }
                  }
                }
                break
              }
              case 'message_delta': {
                totalInputTokens += evt.usage?.input_tokens ?? 0
                totalOutputTokens += evt.usage.output_tokens
                if (evt.delta?.stop_reason) {
                  stopReason = evt.delta.stop_reason
                }
                break
              }
            }
          }
          streamComplete = true
        },
        {
          maxRetries: 1,
          onRetry: (_attempt, err) => {
            if (!isRetryableError(err)) throw err
          },
        },
      )
    } catch (err: unknown) {
      if (options.abortSignal?.aborted) {
        yield {
          type: 'terminal',
          reason: 'aborted',
          turnCount: turnLimitManager.getTurnCount(),
          totalInputTokens,
          totalOutputTokens,
        }
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      logError(`Query error: ${msg}`)

      if (isPromptTooLongError(msg) && !hasAttemptedReactiveCompact) {
        hasAttemptedReactiveCompact = true
        const result = reactiveCompact(conversation.fullMessages)
        if (result.didCompact) {
          conversation.fullMessages.length = 0
          conversation.fullMessages.push(...result.messages)
          // Trim UUIDs to match new message count
          conversation.messageUuids.length = Math.min(
            conversation.messageUuids.length,
            result.messages.length,
          )
          conversation.toolResultBudgetState = createToolResultBudgetState()
          conversation.forceCompactNextProjection = false
          runPostCompactCleanup()
          yield {
            type: 'error',
            message: 'Recovery compact triggered, retrying...',
          }
          continue
        }
      }

      yield { type: 'error', message: msg }
      yield {
        type: 'terminal',
        reason: 'model_error',
        turnCount: turnLimitManager.getTurnCount(),
        totalInputTokens,
        totalOutputTokens,
        error: msg,
      }
      return
    }

    if (!streamComplete && !options.abortSignal?.aborted) {
      yield { type: 'error', message: 'Stream incomplete' }
      yield {
        type: 'terminal',
        reason: 'model_error',
        turnCount: turnLimitManager.getTurnCount(),
        totalInputTokens,
        totalOutputTokens,
        error: 'Stream incomplete',
      }
      return
    }

    if (options.abortSignal?.aborted) {
      yield {
        type: 'terminal',
        reason: 'aborted',
        turnCount: turnLimitManager.getTurnCount(),
        totalInputTokens,
        totalOutputTokens,
      }
      return
    }

    // max_output_tokens recovery: model was cut off mid-response
    if (
      stopReason === 'max_tokens' &&
      recoveryCount < 3 &&
      toolUses.length === 0
    ) {
      const partialContent: ContentItem[] = contentBlocks.map(b =>
        b.type === 'tool_use'
          ? {
              type: 'tool_use' as const,
              id: b.id,
              name: b.name,
              input: b.input,
            }
          : { type: 'text' as const, text: b.text },
      )
      if (partialContent.length > 0) {
        messages.push({ role: 'assistant', content: partialContent })
      }
      const recoveryMsg =
        recoveryCount === 0
          ? '[Response cut off by output token limit. Increase token budget and continue from where you left off.]'
          : '[Response cut off again. Continue your response from where you were interrupted.]'
      messages.push({ role: 'user', content: recoveryMsg })
      recoveryCount++
      yield {
        type: 'recovery' as const,
        reason: 'max_tokens_continue',
        attempt: recoveryCount,
      }
      continue
    }

    // Yield collected text deltas after stream completes
    for (const text of textDeltas) {
      yield { type: 'text_delta' as const, text }
    }
    // Yield tool starts
    for (const tu of toolUses) {
      yield {
        type: 'tool_start' as const,
        id: tu.id,
        name: tu.name,
        input: tu.input,
      }
    }
    // Yield usage
    yield {
      type: 'usage' as const,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalInputTokens,
      totalOutputTokens,
    }

    const assistantContent: ContentItem[] = contentBlocks.map(b =>
      b.type === 'tool_use'
        ? { type: 'tool_use' as const, id: b.id, name: b.name, input: b.input }
        : { type: 'text' as const, text: b.text },
    )
    if (assistantContent.length > 0) {
      messages.push({ role: 'assistant', content: assistantContent })
    }

    if (toolUses.length === 0) {
      yield {
        type: 'turn_end',
        turnCount: turnLimitManager.getTurnCount(),
        toolUseCount: 0,
      }
      yield {
        type: 'terminal',
        reason: 'completed',
        turnCount: turnLimitManager.getTurnCount(),
        totalInputTokens,
        totalOutputTokens,
      }
      return
    }

    const toolUseRequests = toolUses.map(tu => ({
      id: tu.id,
      name: tu.name,
      input: tu.input,
    }))

    const { toolResults } = await orchestrateToolExecution(
      toolUseRequests,
      toolsMap,
      cwd,
      {
        canUseTool: options.canUseTool,
        abortSignal: options.abortSignal,
        isInteractive: options.isInteractive,
      },
    )

    for (const tr of toolResults) {
      const raw = tr as unknown as Record<string, unknown>
      const content = typeof raw.content === 'string' ? raw.content : ''
      yield {
        type: 'tool_result' as const,
        id: raw.tool_use_id as string,
        name: toolUses.find(tu => tu.id === raw.tool_use_id)?.name ?? 'unknown',
        success: !raw.is_error,
        content,
        isError: raw.is_error === true,
      }
    }

    // Persist large tool results to disk to reduce memory and session size
    const persistedResults = toolResults.map(tr => {
      const raw = tr as unknown as Record<string, unknown>
      if (raw.content && typeof raw.content === 'string' && !raw.is_error) {
        const persisted = persistLargeToolResult(raw.content)
        if (persisted !== raw.content) {
          return { ...tr, content: persisted } as typeof tr
        }
      }
      return tr
    })
    messages.push({ role: 'user', content: persistedResults })
    yield {
      type: 'turn_end',
      turnCount: turnLimitManager.getTurnCount(),
      toolUseCount: toolUses.length,
    }
  }
}

function safeJsonMerge(
  existing: Record<string, unknown>,
  partial: string,
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(partial) as Record<string, unknown>
    return { ...existing, ...parsed }
  } catch {
    return existing
  }
}
