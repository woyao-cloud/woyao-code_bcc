import { streamClaudeAPI } from './services/api/claude.js'
import { resolveModel } from './utils/model/model.js'
import { getPermissionMode } from './utils/settings/settings.js'
import { requestPermission } from './services/permission/permissionManager.js'
import { retryWithBackoff, classifyAPIError } from './services/retry.js'
import type { RetryEvent } from './services/retry.js'
import { logError, logInfo, logWarning, logDebug, logTiming } from './utils/log.js'
import { createDefaultTurnLimitManager } from './utils/turnLimit.js'
import {
  projectMessagesForAPI,
  createConversationBuffers,
  pushMessageWithUuid,
  type ConversationBuffers,
} from './services/messages/apiProjection.js'
import { createToolResultBudgetState } from './services/compact/autoCompact.js'
import { runPostCompactCleanup } from './services/compact/postCompactCleanup.js'
import {
  reactiveCompact,
  isPromptTooLongError,
} from './services/compact/reactiveCompact.js'
import { estimateMaxTurnGrowth } from './services/compact/autoCompact.js'
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
  fallbackModel?: string
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
  let hasAttemptedFallback = false
  let recoveryCount = 0
  let lastMaxTokensOutputTokens = 0
  const DEFAULT_MAX_TOKENS = 32000
  const ESCALATED_MAX_TOKENS = 64000

  logInfo(`Query started: ${messages.length} messages, ${tools.length} tools`, {
    model: options.model,
    maxTurns: options.maxTurns,
  })

  while (true) {
    const turnResult = turnLimitManager.increment()
    const turnCount = turnLimitManager.getTurnCount()
    
    logDebug(`Turn ${turnCount} started`, { 
      shouldContinue: turnResult.shouldContinue,
      maxTurns: options.maxTurns 
    })
    
    if (!turnResult.shouldContinue) {
      logWarning(`Turn limit reached: ${turnCount}`, { maxTurns: options.maxTurns })
      yield {
        type: 'terminal',
        reason: 'max_turns',
        turnCount,
        totalInputTokens,
        totalOutputTokens,
      }
      return
    }

    let activeModel = options.model ?? resolveModel()
    logDebug(`Using model: ${activeModel}`)
    
    let { messagesForAPI, estimatedTokens, estimatedHeadroom } = projectMessagesForAPI(conversation, {
      model: activeModel,
      commitCompactionToConversation: true,
    })

    // Predictive autocompact: if next turn's estimated growth would overflow
    // the context window, compact preemptively to avoid prompt-too-long errors.
    const growthEstimate = estimateMaxTurnGrowth(activeModel)
    if (estimatedHeadroom < growthEstimate) {
      logInfo(`Predictive autocompact: headroom=${estimatedHeadroom} < growth=${growthEstimate}, forcing compact`)
      const projected = projectMessagesForAPI(conversation, {
        model: activeModel,
        forceCompact: true,
        commitCompactionToConversation: true,
      })
      if (projected.estimatedTokens < estimatedTokens) {
        messagesForAPI = projected.messagesForAPI
      }
    }

    logDebug(`Messages for API: ${messagesForAPI.length}`, { 
      totalMessages: conversation.fullMessages.length 
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

    // Stream processing with retryWithBackoff for transient errors.
    // Yields retry_event for UI feedback, then processes stream events.
    let streamError: Error | null = null
    try {
      const retryGen = retryWithBackoff(
        async function* () {
          // Stream watchdog: nested AbortController for idle timeout
          const innerAbort = new AbortController()
          options.abortSignal?.addEventListener?.('abort', () => innerAbort.abort(), { once: true })

          const stream = streamClaudeAPI({
            messages: messagesForAPI,
            systemPrompt: fullSystemPrompt,
            tools,
            model: activeModel,
            maxTokens:
              recoveryCount > 0 ? ESCALATED_MAX_TOKENS : DEFAULT_MAX_TOKENS,
            signal: innerAbort.signal,
          })

          let lastActivity = Date.now()
          let watchdogTimedOut = false
          let stallWarned = false
          const STALL_WARN_MS = 30000
          const IDLE_TIMEOUT_MS = 90000

          const watchdogTimer = setInterval(() => {
            const elapsed = Date.now() - lastActivity
            if (elapsed >= IDLE_TIMEOUT_MS) {
              watchdogTimedOut = true
              innerAbort.abort()
            } else if (elapsed >= STALL_WARN_MS && !stallWarned) {
              stallWarned = true
              process.stderr.write('\n  [Warning] Stream stalled: no data for 30s\n')
            }
          }, 5000)

          try {
            for await (const event of stream) {
              lastActivity = Date.now()
              stallWarned = false
              yield event
            }
          } catch (err: unknown) {
            if (watchdogTimedOut) {
              throw new Error('Stream idle timeout: no data for 90s')
            }
            throw err
          } finally {
            clearInterval(watchdogTimer)
          }
        },
        { maxRetries: 2 },
      )

      for await (const item of retryGen) {
        if ((item as RetryEvent).type === 'retry') {
          const re = item as RetryEvent
          yield {
            type: 'retry_event',
            attempt: re.attempt,
            maxRetries: re.maxRetries,
            error: re.error,
            category: re.category,
            delayMs: re.delayMs,
          }
          continue
        }

        if (options.abortSignal?.aborted) break
        const evt = item as BetaRawMessageStreamEvent
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
                // Yield text in real-time during streaming
                yield { type: 'text_delta' as const, text: delta.text }
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
      streamError = null
    } catch (err: unknown) {
      streamError = err instanceof Error ? err : new Error(String(err))
    }

    if (streamError) {
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
      const msg = streamError.message
      logError(`Query error: ${msg}`)

      if (isPromptTooLongError(msg) && !hasAttemptedReactiveCompact) {
        hasAttemptedReactiveCompact = true
        const result = reactiveCompact(conversation.fullMessages)
        if (result.didCompact) {
          conversation.fullMessages.length = 0
          conversation.fullMessages.push(...result.messages)
          // Sync messages array (cli's conversation reference) to match compacted state
          messages.length = 0
          messages.push(...result.messages)
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

      // Model fallback: if retryWithBackoff exhausted but the error is a
      // server-side issue (503 overloaded, etc.) and a fallback model is
      // configured, switch models and retry.
      if (!hasAttemptedFallback && options.fallbackModel && activeModel !== options.fallbackModel) {
        const category = classifyAPIError(streamError)
        if (category === 'server_error' || category === 'rate_limit' || category === 'connection_error') {
          hasAttemptedFallback = true
          activeModel = options.fallbackModel
          logWarning(`Falling back to model: ${activeModel} after error: ${category}`)
          yield {
            type: 'error',
            message: `Switching to fallback model (${activeModel}) due to ${category}...`,
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
    // Includes diminishing returns detection: if delta < 500 tokens, stop recovery
    if (
      stopReason === 'max_tokens' &&
      recoveryCount < 3 &&
      toolUses.length === 0
    ) {
      // Diminishing returns: token delta too small, model can't make progress
      if (lastMaxTokensOutputTokens > 0) {
        const delta = totalOutputTokens - lastMaxTokensOutputTokens
        if (delta < 500) {
          logWarning('max_tokens diminishing returns detected, stopping recovery', { delta })
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
      }
      lastMaxTokensOutputTokens = totalOutputTokens

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
        const partialMsg = { role: 'assistant' as const, content: partialContent }
        messages.push(partialMsg)
        pushMessageWithUuid(conversation, partialMsg)
      }
      const recoveryMsg =
        recoveryCount === 0
          ? '[Response cut off by output token limit. Increase token budget and continue from where you left off.]'
          : '[Response cut off again. Continue your response from where you were interrupted.]'
      const recoveryUserMsg = { role: 'user' as const, content: recoveryMsg }
      messages.push(recoveryUserMsg)
      pushMessageWithUuid(conversation, recoveryUserMsg)
      recoveryCount++
      yield {
        type: 'recovery' as const,
        reason: 'max_tokens_continue',
        attempt: recoveryCount,
      }
      continue
    }

    // Note: text_delta events were already yielded in real-time during streaming above.
    // Only tool starts, usage, tool results need to be yielded here.

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

    // Warn if model returned nothing useful
    if (textDeltas.length === 0 && toolUses.length === 0) {
      process.stderr.write('\n  [Warning] Model returned no text and no tool calls. Check API configuration or model capabilities.\n')
    }

    const assistantContent: ContentItem[] = contentBlocks.map(b =>
      b.type === 'tool_use'
        ? { type: 'tool_use' as const, id: b.id, name: b.name, input: b.input }
        : { type: 'text' as const, text: b.text },
    )
    if (assistantContent.length > 0) {
      const assistantMsg = { role: 'assistant' as const, content: assistantContent }
      messages.push(assistantMsg)
      pushMessageWithUuid(conversation, assistantMsg)
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

    logInfo(`Executing ${toolUseRequests.length} tool(s): ${toolUseRequests.map(t => t.name).join(', ')}`)
    
    const { toolResults } = await logTiming(
      `tool_execution_${toolUseRequests.map(t => t.name).join('_')}`,
      () => orchestrateToolExecution(
        toolUseRequests,
        toolsMap,
        cwd,
        {
          canUseTool: options.canUseTool,
          abortSignal: options.abortSignal,
          isInteractive: options.isInteractive,
        },
      ),
      30000 // 30 second threshold for slow tool execution
    )

    const failedTools = toolResults.filter(tr => {
      const raw = tr as unknown as Record<string, unknown>
      return raw.is_error === true
    })
    
    if (failedTools.length > 0) {
      logWarning(`${failedTools.length} tool(s) failed`, {
        toolNames: failedTools.map(tr => {
          const raw = tr as unknown as Record<string, unknown>
          return raw.tool_use_id
        })
      })
    }

    for (const tr of toolResults) {
      const raw = tr as unknown as Record<string, unknown>
      const content = typeof raw.content === 'string' ? raw.content : ''
      const toolName = toolUses.find(tu => tu.id === raw.tool_use_id)?.name ?? 'unknown'
      
      if (raw.is_error) {
        logWarning(`Tool failed: ${toolName}`, { 
          error: content,
          toolUseId: raw.tool_use_id 
        })
      } else {
        logDebug(`Tool succeeded: ${toolName}`, { toolUseId: raw.tool_use_id })
      }
      
      yield {
        type: 'tool_result' as const,
        id: raw.tool_use_id as string,
        name: toolName,
        success: !raw.is_error,
        content,
        isError: raw.is_error === true,
      }
    }

    // Missing tool result protection: inject synthetic error results
    // for tool_use blocks that didn't receive a corresponding tool_result
    const resultUseIds = new Set(
      toolResults.map(tr => {
        const raw = tr as unknown as Record<string, unknown>
        return raw.tool_use_id as string
      }),
    )
    for (const tu of toolUses) {
      if (!resultUseIds.has(tu.id)) {
        const syntheticContent = `Tool result missing for ${tu.name}. Execution was interrupted.`
        const syntheticResult = {
          type: 'tool_result' as const,
          tool_use_id: tu.id,
          content: syntheticContent,
          is_error: true,
        }
        toolResults.push(syntheticResult as ContentItem)
        yield {
          type: 'tool_result' as const,
          id: tu.id,
          name: tu.name,
          success: false,
          content: syntheticContent,
          isError: true,
        }
        logWarning(`Missing tool result injected: ${tu.name}`, { toolUseId: tu.id })
      }
    }

    // Persist large tool results to disk to reduce memory and session size
    const persistedResults = toolResults.map(tr => {
      const raw = tr as unknown as Record<string, unknown>
      if (
        raw.content &&
        typeof raw.content === 'string' &&
        !raw.is_error
      ) {
        const persisted = persistLargeToolResult(raw.content)
        if (persisted !== raw.content) {
          return { ...tr, content: persisted } as typeof tr
        }
      }
      return tr
    })
    const toolResultMsg = { role: 'user' as const, content: persistedResults }
    messages.push(toolResultMsg)
    pushMessageWithUuid(conversation, toolResultMsg)
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
