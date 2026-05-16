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

    try {
      await withRetry(
        async () => {
          const stream = streamClaudeAPI({
            messages: messagesForAPI,
            systemPrompt: fullSystemPrompt,
            tools,
            model: activeModel,
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
          messages.length = 0
          messages.push(...result.messages)
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

    const toolResults: ContentItem[] = []
    const CONCURRENT_SAFE_TOOLS = new Set([
      'Grep',
      'Glob',
      'Read',
      'WebFetch',
      'WebSearch',
    ])
    const MAX_CONCURRENCY = 5

    type PendingTool = {
      toolUse: (typeof toolUses)[0]
      tool: Tool
      ctx: ToolUseContext
    }

    const pendingTools: PendingTool[] = []

    for (const toolUse of toolUses) {
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

      const tool = toolsMap.get(toolUse.name)
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Unknown tool: ${toolUse.name}`,
          is_error: true,
        })
        yield {
          type: 'tool_result',
          id: toolUse.id,
          name: toolUse.name,
          success: false,
          content: `Unknown tool: ${toolUse.name}`,
          isError: true,
        }
        continue
      }

      let allowed = true
      if (options.canUseTool) {
        allowed = await options.canUseTool(tool.name, toolUse.input)
      } else {
        allowed = await requestPermission({
          toolName: tool.name,
          toolDescription: tool.description,
          input: toolUse.input,
        })
      }

      if (!allowed) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Permission denied.',
          is_error: true,
        })
        yield {
          type: 'tool_result',
          id: toolUse.id,
          name: toolUse.name,
          success: false,
          content: 'Permission denied.',
          isError: true,
        }
        continue
      }

      const ctx: ToolUseContext = {
        toolUse: {
          type: 'tool_use',
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        },
        permissionMode: getPermissionMode(cwd) as 'default',
        toolPermissionContext: {
          mode: 'default',
          additionalWorkingDirectories: new Map(),
          alwaysAllowRules: {},
          alwaysDenyRules: {},
          isBypassPermissionsModeAvailable: false,
        },
        cwd,
        abortSignal: options.abortSignal ?? new AbortController().signal,
        messages: [],
        isInteractive: options.isInteractive ?? true,
      }

      pendingTools.push({ toolUse, tool, ctx })
    }

    // Partition: read-only tools run concurrently, write tools run serially
    const readOnlyTools = pendingTools.filter(p =>
      CONCURRENT_SAFE_TOOLS.has(p.toolUse.name),
    )
    const writeTools = pendingTools.filter(
      p => !CONCURRENT_SAFE_TOOLS.has(p.toolUse.name),
    )

    async function execOne(
      p: PendingTool,
    ): Promise<{ toolResult: ContentItem; queryEvent: QueryEvent }> {
      const result: ToolResult = await p.tool.execute(p.ctx, p.toolUse.input)
      const content = persistLargeToolResult(result.content)
      return {
        toolResult: {
          type: 'tool_result' as const,
          tool_use_id: p.toolUse.id,
          content,
          is_error: !result.success,
        },
        queryEvent: {
          type: 'tool_result' as const,
          id: p.toolUse.id,
          name: p.toolUse.name,
          success: result.success,
          content,
          isError: !result.success,
        },
      }
    }

    // Execute read-only tools concurrently (limited concurrency)
    for (let i = 0; i < readOnlyTools.length; i += MAX_CONCURRENCY) {
      const batch = readOnlyTools.slice(i, i + MAX_CONCURRENCY)
      const batchResults = await Promise.all(batch.map(p => execOne(p)))
      for (const r of batchResults) {
        toolResults.push(r.toolResult)
        yield r.queryEvent
      }
    }

    // Execute write tools serially
    for (const p of writeTools) {
      const r = await execOne(p)
      toolResults.push(r.toolResult)
      yield r.queryEvent
    }

    messages.push({ role: 'user', content: toolResults })
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
