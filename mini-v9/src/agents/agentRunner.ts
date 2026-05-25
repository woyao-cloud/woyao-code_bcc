// ============================================================
// Agent Runner for mini-v8
// ============================================================
// Runs a subagent in-process with:
// - Sync execution (await completion) — runAgentSync
// - Async execution (fire-and-forget) — runAgentAsync
// - Isolated message list (forked from parent context)
// - Tool filtering based on agent definition
// - Turn limiting
// - Result collection and aggregation
// ============================================================

import { randomUUID } from 'crypto'
import { streamClaudeAPI, type QueryParams } from '../services/api/claude.js'
import { getTools, getToolsMap } from '../tools/tools.js'
import { requestPermission } from '../services/permission/permissionManager.js'
import { getPermissionMode } from '../utils/settings/settings.js'
import { getAPIKey } from '../utils/auth.js'
import { resolveModel } from '../utils/model/model.js'
import { logError, logDebug } from '../utils/log.js'
import {
  createConversationBuffers,
  projectMessagesForAPI,
} from '../services/messages/apiProjection.js'
import { withRetry, isRetryableError } from '../services/retry.js'
import { getCwd } from '../bootstrap/state.js'
import { getSystemContext, getUserContext } from '../context.js'
import { agentTaskStore } from '../services/taskStore.js'
import {
  runWithAgentContext,
  createSubagentContext,
  getAgentContext,
} from '../utils/agentContext.js'
import { loadAgentMemoryPrompt, ensureAgentMemoryDir } from './agentMemory.js'
import type {
  AgentDefinition,
  AgentInstance,
  AgentStatus,
  AgentResult,
  AgentRunContext,
  AgentProgress,
  AgentTaskState,
} from './agentTypes.js'
import { getAgent } from './agentRegistry.js'
import { shouldSummarize, buildAgentProgressSummary } from './agentSummarization.js'
import type { Tool, ToolUseContext } from '../Tool.js'
import type { ContentItem } from '../types/message.js'
import type {
  BetaMessageParam,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ---------- Agent Runner ----------

export interface AgentRunOptions {
  /** The agent definition or type string */
  agent: AgentDefinition | string
  /** The task description */
  task: string
  /** Parent messages for context continuity */
  parentMessages?: BetaMessageParam[]
  /** Parent tool-result replacements for stable replay in forked contexts */
  parentToolResultReplacements?: ReadonlyMap<string, string>
  /** Max turns override */
  maxTurns?: number
  /** Model override */
  model?: string
  /** Callback for each message (streaming) */
  onMessage?: (text: string) => void
  /** Permission check override */
  canUseTool?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => Promise<boolean>
  /** Run in background (async, non-blocking). Default: false */
  runInBackground?: boolean
  /** Progress callback for async execution */
  onProgress?: (progress: AgentProgress) => void
  /** Tool use ID for notification correlation */
  toolUseId?: string
}

/**
 * Build the full system prompt for an agent, including memory prompt if applicable.
 */
function buildAgentSystemPrompt(
  agentDef: AgentDefinition,
  cwd: string,
): string {
  let prompt = agentDef.getSystemPrompt()

  if (agentDef.memory) {
    ensureAgentMemoryDir(agentDef.agentType, agentDef.memory, cwd)
    const memoryPrompt = loadAgentMemoryPrompt(
      agentDef.agentType,
      agentDef.memory,
      cwd,
    )
    if (memoryPrompt) {
      prompt += '\n\n' + memoryPrompt
    }
  }

  return prompt
}

/**
 * Run an agent synchronously (blocks until completion).
 * Returns the aggregated result when the agent completes.
 */
export async function runAgentSync(
  options: AgentRunOptions,
): Promise<AgentResult> {
  const agentDef = resolveAgentDef(options.agent)
  if (!agentDef) {
    return makeErrorResult(
      'unknown',
      `Agent type not found: ${String(options.agent)}`,
    )
  }

  const apiKey = getAPIKey()
  if (!apiKey) {
    return makeErrorResult(agentDef.agentType, 'API key not configured')
  }

  const instanceId = randomUUID()
  const maxTurns = options.maxTurns ?? agentDef.maxTurns ?? 25
  const model = options.model ?? agentDef.model ?? resolveModel()
  const cwd = getCwd()
  const startTime = Date.now()

  // Get filtered tools for this agent
  const allTools = getTools()
  const filteredTools = filterToolsForAgent(allTools, agentDef)
  const toolsMap = new Map<string, Tool>()
  for (const t of filteredTools) {
    toolsMap.set(t.name, t)
  }

  // Build agent system prompt (with memory prompt if applicable)
  const agentSystemPrompt = buildAgentSystemPrompt(agentDef, cwd)

  const conversation = createConversationBuffers(options.parentMessages ?? [], {
    inheritedToolResultReplacements: options.parentToolResultReplacements,
  })
  conversation.fullMessages.push({
    role: 'user',
    content: options.task,
  })

  // Build ALS context for nested agent tracking
  const alsContext = createSubagentContext({
    agentId: instanceId,
    agentType: agentDef.agentType,
    agentName: agentDef.agentType,
    isAsync: false,
  })

  // Run the shared core loop inside ALS context
  const abortController = new AbortController()
  const result = await runWithAgentContext(alsContext, () =>
    runAgentLoopCore({
      instanceId,
      agentDef,
      filteredTools,
      toolsMap,
      agentSystemPrompt,
      conversation,
      maxTurns,
      model,
      cwd,
      abortController,
      canUseToolOverride: options.canUseTool,
      onMessage: options.onMessage,
      startTime,
    }),
  )

  return result
}

/**
 * Run an agent asynchronously (fire-and-forget).
 * Returns immediately with a task state that tracks the running agent.
 * The caller receives results via task-notification or polling.
 */
export function runAgentAsync(options: AgentRunOptions): AgentTaskState {
  const agentDef = resolveAgentDef(options.agent)
  if (!agentDef) {
    throw new Error(`Agent type not found: ${String(options.agent)}`)
  }

  const apiKey = getAPIKey()
  if (!apiKey) {
    throw new Error('API key not configured')
  }

  const instanceId = randomUUID()
  const maxTurns = options.maxTurns ?? agentDef.maxTurns ?? 25
  const model = options.model ?? agentDef.model ?? resolveModel()
  const cwd = getCwd()
  const startTime = Date.now()

  // Async agents get an independent AbortController (survives parent ESC)
  const abortController = new AbortController()

  // Create task in store
  const taskState = agentTaskStore.create({
    agentId: instanceId,
    agentType: agentDef.agentType,
    agentName: agentDef.agentType,
    prompt: options.task,
    model,
    toolUseId: options.toolUseId,
    abortController,
  })

  // Build ALS context for async agent tracking
  const alsContext = createSubagentContext({
    agentId: instanceId,
    agentType: agentDef.agentType,
    agentName: agentDef.agentType,
    isAsync: true,
  })

  // Get filtered tools
  const allTools = getTools()
  const filteredTools = filterToolsForAgent(allTools, agentDef)
  const toolsMap = new Map<string, Tool>()
  for (const t of filteredTools) {
    toolsMap.set(t.name, t)
  }

  // Build agent system prompt (with memory prompt if applicable)
  const agentSystemPrompt = buildAgentSystemPrompt(agentDef, cwd)

  const conversation = createConversationBuffers(options.parentMessages ?? [], {
    inheritedToolResultReplacements: options.parentToolResultReplacements,
  })
  conversation.fullMessages.push({
    role: 'user',
    content: options.task,
  })

  // Fire-and-forget the core loop, wrapped in ALS context
  void runWithAgentContext(alsContext, () =>
    runAgentLoopCore({
      instanceId,
      agentDef,
      filteredTools,
      toolsMap,
      agentSystemPrompt,
      conversation,
      maxTurns,
      model,
      cwd,
      abortController,
      canUseToolOverride: options.canUseTool,
      onMessage: options.onMessage,
      startTime,
    }),
  )
    .then(result => {
      agentTaskStore.complete(taskState.taskId, result)
      options.onProgress?.({
        turnCount: 0,
        totalTokens: result.totalTokens,
        toolUseCount: result.totalToolUseCount,
        lastActivity: Date.now(),
      })
    })
    .catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      if (abortController.signal.aborted) {
        agentTaskStore.kill(taskState.taskId)
      } else {
        agentTaskStore.fail(taskState.taskId, msg)
      }
    })

  return taskState
}

/** @deprecated Use runAgentSync or runAgentAsync instead */
export const runAgent = runAgentSync

// ---------- Core Agent Loop (shared by sync and async) ----------

interface AgentLoopParams {
  instanceId: string
  agentDef: AgentDefinition
  filteredTools: Tool[]
  toolsMap: Map<string, Tool>
  agentSystemPrompt: string
  conversation: ReturnType<typeof createConversationBuffers>
  maxTurns: number
  model: string
  cwd: string
  abortController: AbortController
  canUseToolOverride?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => Promise<boolean>
  onMessage?: (text: string) => void
  startTime: number
}

async function runAgentLoopCore(params: AgentLoopParams): Promise<AgentResult> {
  const {
    instanceId,
    agentDef,
    filteredTools,
    toolsMap,
    agentSystemPrompt,
    conversation,
    maxTurns,
    model,
    cwd,
    abortController,
    canUseToolOverride,
    onMessage,
    startTime,
  } = params

  let turnCount = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalToolUseCount = 0
  const contentOutput: string[] = []

  try {
    while (turnCount < maxTurns) {
      // Check for cancellation
      if (abortController.signal.aborted) {
        throw new Error('Agent aborted')
      }

      turnCount++

      const { messagesForAPI } = projectMessagesForAPI(conversation, {
        model,
        commitCompactionToConversation: true,
      })

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

      let fullText = ''
      let streamComplete = false

      try {
        await withRetry(
          async () => {
            const stream = streamClaudeAPI({
              messages: messagesForAPI,
              systemPrompt:
                agentSystemPrompt +
                '\n\n' +
                (await getSystemContext(undefined, {
                  conversationMessages: messagesForAPI,
                  sessionMemoryMode: 'auto',
                  // omitClaudeMd saves tokens for search/plan agents that don't need project conventions
                  includeClaudeMd: !agentDef.omitClaudeMd,
                })),
              tools: filteredTools,
              model,
            })

            for await (const event of stream) {
              if (abortController.signal.aborted) break
              const evt = event as BetaRawMessageStreamEvent
              switch (evt.type) {
                case 'message_start':
                  break
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
                      onMessage?.(delta.text)
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
        if (abortController.signal.aborted) {
          throw new Error('Agent aborted')
        }
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Agent API error: ${msg}`)
      }

      if (!streamComplete && !abortController.signal.aborted) {
        throw new Error('Agent stream incomplete')
      }

      if (abortController.signal.aborted) {
        throw new Error('Agent aborted')
      }

      // Collect text output
      if (fullText) {
        contentOutput.push(fullText)
      }

      const assistantContent: ContentItem[] = contentBlocks.map(b =>
        b.type === 'tool_use'
          ? {
              type: 'tool_use' as const,
              id: b.id,
              name: b.name,
              input: b.input,
            }
          : { type: 'text' as const, text: b.text },
      )
      if (assistantContent.length > 0) {
        conversation.fullMessages.push({
          role: 'assistant',
          content: assistantContent,
        })
      }

      // No tool calls => agent is done
      if (toolUses.length === 0) {
        break
      }

      // Execute tool calls
      const toolResults: ContentItem[] = []
      for (const toolUse of toolUses) {
        totalToolUseCount++

        // Check abort before each tool execution
        if (abortController.signal.aborted) {
          throw new Error('Agent aborted')
        }

        const tool = toolsMap.get(toolUse.name)

        if (!tool) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Unknown tool: ${toolUse.name}`,
            is_error: true,
          })
          continue
        }

        // Permission check
        let allowed = true
        if (canUseToolOverride) {
          allowed = await canUseToolOverride(tool.name, toolUse.input)
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
          continue
        }

        // Execute tool
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
          abortSignal: abortController.signal,
          messages: [],
          isInteractive: false,
        }

        const result = await tool.execute(ctx, toolUse.input)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: !result.success,
        })
      }

      // Add tool results
      conversation.fullMessages.push({
        role: 'user',
        content: toolResults,
      })

      // Periodic summarization hook
      if (shouldSummarize(turnCount) && params.onProgress) {
        const summary = buildAgentProgressSummary(
          instanceId,
          turnCount,
          totalInputTokens + totalOutputTokens,
          totalToolUseCount,
          contentOutput,
        )
        params.onProgress({
          turnCount,
          totalTokens: totalInputTokens + totalOutputTokens,
          toolUseCount: totalToolUseCount,
          lastActivity: Date.now(),
          summary: summary.summary,
        })
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (errorMsg === 'Agent aborted') {
      return {
        agentId: instanceId,
        status: 'cancelled',
        content: contentOutput,
        totalTokens: totalInputTokens + totalOutputTokens,
        totalToolUseCount,
        totalDurationMs: Date.now() - startTime,
        error: 'Agent was cancelled',
      }
    }
    logError(`Agent [${agentDef.agentType}] error: ${errorMsg}`)
    return {
      agentId: instanceId,
      status: 'failed',
      content: contentOutput,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalToolUseCount,
      totalDurationMs: Date.now() - startTime,
      error: errorMsg,
    }
  }

  const totalDurationMs = Date.now() - startTime
  logDebug(
    `Agent [${agentDef.agentType}] ${instanceId.slice(0, 8)} completed: ${turnCount} turns, ${totalInputTokens + totalOutputTokens} tokens, ${totalDurationMs}ms`,
  )

  return {
    agentId: instanceId,
    status: 'completed',
    content: contentOutput,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalToolUseCount,
    totalDurationMs,
  }
}

// ---------- Helpers ----------

function resolveAgentDef(
  agent: AgentDefinition | string,
): AgentDefinition | undefined {
  if (typeof agent === 'string') return getAgent(agent)
  return agent
}

/**
 * Filter available tools for an agent based on its definition.
 * For agents with memory scope and a specific tool list, automatically
 * inject Write, Edit, and Read so they can persist/recall memories.
 */
function filterToolsForAgent(allTools: Tool[], agent: AgentDefinition): Tool[] {
  // Resolve effective tool list, injecting Write/Edit/Read for memory agents
  let effectiveToolList = agent.tools
  if (
    agent.memory &&
    agent.tools &&
    agent.tools.length > 0 &&
    agent.tools[0] !== '*'
  ) {
    const required = ['Write', 'Edit', 'Read']
    if (!required.every(t => agent.tools!.includes(t))) {
      effectiveToolList = [...new Set([...agent.tools, ...required])]
    }
  }

  // If tools is ['*'], use all tools
  if (
    effectiveToolList &&
    effectiveToolList.length === 1 &&
    effectiveToolList[0] === '*'
  ) {
    // Filter out disallowed tools
    if (agent.disallowedTools && agent.disallowedTools.length > 0) {
      return allTools.filter(t => !agent.disallowedTools!.includes(t.name))
    }
    return allTools
  }

  // If specific tools are listed, use only those
  if (effectiveToolList && effectiveToolList.length > 0) {
    const toolSet = new Set(effectiveToolList)
    return allTools.filter(t => toolSet.has(t.name))
  }

  // If disallowed tools are specified, exclude them
  if (agent.disallowedTools && agent.disallowedTools.length > 0) {
    return allTools.filter(t => !agent.disallowedTools!.includes(t.name))
  }

  return allTools
}

/** Safely merge partial JSON into existing object */
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

/** Create an error result for immediate failures */
function makeErrorResult(agentType: string, error: string): AgentResult {
  return {
    agentId: 'error-' + randomUUID().slice(0, 8),
    status: 'failed',
    content: [],
    totalTokens: 0,
    totalToolUseCount: 0,
    totalDurationMs: 0,
    error: `Agent [${agentType}]: ${error}`,
  }
}
