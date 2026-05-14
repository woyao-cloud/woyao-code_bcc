// ============================================================
// Agent Runner for mini-v8
// ============================================================
// Runs a subagent in-process with:
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
  needsCompaction,
  compactMessages,
  microcompactToolResults,
} from '../services/compact/autoCompact.js'
import { withRetry, isRetryableError } from '../services/retry.js'
import { getCwd } from '../bootstrap/state.js'
import { getSystemContext, getUserContext } from '../context.js'
import { getSessionMemorySummaryForCompact } from '../services/memory/sessionMemory.js'
import type {
  AgentDefinition,
  AgentInstance,
  AgentStatus,
  AgentResult,
  AgentRunContext,
} from './agentTypes.js'
import { getAgent } from './agentRegistry.js'
import type { Tool, ToolUseContext } from '../Tool.js'
import type { ContentItem } from '../types/message.js'
import type {
  BetaMessageParam,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ---------- Module-level Agent Context Tracking ----------

/** Active agent contexts tracked by instance ID */
const activeAgents = new Map<string, AgentRunContext>()

/** Get the current active agent context (last one registered) */
export function getCurrentAgentContext(): AgentRunContext | undefined {
  const values = Array.from(activeAgents.values())
  return values[values.length - 1]
}

/** Get an agent context by ID */
export function getAgentContext(agentId: string): AgentRunContext | undefined {
  return activeAgents.get(agentId)
}

// ---------- Agent Runner ----------

export interface AgentRunOptions {
  /** The agent definition or type string */
  agent: AgentDefinition | string
  /** The task description */
  task: string
  /** Parent messages for context continuity */
  parentMessages?: BetaMessageParam[]
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
}

function replaceMessages(
  target: BetaMessageParam[],
  next: BetaMessageParam[],
): boolean {
  if (target === next) {
    return false
  }

  target.splice(0, target.length, ...next)
  return true
}

function applyConversationCompaction(
  messages: BetaMessageParam[],
  model: string,
): void {
  const microcompacted = microcompactToolResults(messages)
  replaceMessages(messages, microcompacted)

  if (needsCompaction(messages, model)) {
    const sessionMemorySummary = getSessionMemorySummaryForCompact(messages)
    replaceMessages(
      messages,
      compactMessages(messages, {
        sessionMemorySummary,
      }),
    )
  }
}

/**
 * Run an agent as a subagent.
 * Returns the aggregated result when the agent completes.
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentResult> {
  const {
    agent: agentOrType,
    task,
    parentMessages = [],
    maxTurns: maxTurnsOverride,
    model: modelOverride,
    onMessage,
    canUseTool: canUseToolOverride,
  } = options

  // Resolve agent definition
  const agentDef =
    typeof agentOrType === 'string' ? getAgent(agentOrType) : agentOrType

  if (!agentDef) {
    return makeErrorResult(
      'unknown',
      `Agent type not found: ${String(agentOrType)}`,
    )
  }

  // Validate API key
  const apiKey = getAPIKey()
  if (!apiKey) {
    return makeErrorResult(agentDef.agentType, 'API key not configured')
  }

  // Create agent instance
  const instanceId = randomUUID()
  const maxTurns = maxTurnsOverride ?? agentDef.maxTurns ?? 25
  const model = modelOverride ?? agentDef.model ?? resolveModel()
  const cwd = getCwd()
  const startTime = Date.now()

  // Register agent context
  const agentCtx: AgentRunContext = {
    agentId: instanceId,
    agentType: agentDef.agentType,
    teamName: undefined,
    isTeamLead: false,
    startTime,
  }
  activeAgents.set(instanceId, agentCtx)

  // Get filtered tools for this agent
  const allTools = getTools()
  const filteredTools = filterToolsForAgent(allTools, agentDef)
  const toolsMap = new Map<string, Tool>()
  for (const t of filteredTools) {
    toolsMap.set(t.name, t)
  }

  // Build agent system prompt
  const agentSystemPrompt = agentDef.getSystemPrompt()
  const systemContext = await getSystemContext()

  // Build messages
  const messages: BetaMessageParam[] = [...parentMessages]
  messages.push({
    role: 'user',
    content: task,
  })

  // Run the agent loop
  let turnCount = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalToolUseCount = 0
  const contentOutput: string[] = []

  try {
    while (turnCount < maxTurns) {
      turnCount++

      // Auto-compact if needed
      applyConversationCompaction(messages, model)

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
              messages,
              systemPrompt: agentSystemPrompt + '\n\n' + systemContext,
              tools: filteredTools,
              model,
            })

            for await (const event of stream) {
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
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Agent API error: ${msg}`)
      }

      if (!streamComplete) {
        throw new Error('Agent stream incomplete')
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
        messages.push({
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
          abortSignal: new AbortController().signal,
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
      messages.push({
        role: 'user',
        content: toolResults,
      })
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logError(`Agent [${agentDef.agentType}] error: ${errorMsg}`)
    activeAgents.delete(instanceId)
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

  // Cleanup
  activeAgents.delete(instanceId)

  const totalDurationMs = Date.now() - startTime
  logDebug(
    `Agent [${agentDef.agentType}] completed: ${turnCount} turns, ${totalInputTokens + totalOutputTokens} tokens, ${totalDurationMs}ms`,
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

/**
 * Filter available tools for an agent based on its definition.
 */
function filterToolsForAgent(allTools: Tool[], agent: AgentDefinition): Tool[] {
  // If tools is ['*'], use all tools
  if (agent.tools && agent.tools.length === 1 && agent.tools[0] === '*') {
    // Filter out disallowed tools
    if (agent.disallowedTools && agent.disallowedTools.length > 0) {
      return allTools.filter(t => !agent.disallowedTools!.includes(t.name))
    }
    return allTools
  }

  // If specific tools are listed, use only those
  if (agent.tools && agent.tools.length > 0) {
    const toolSet = new Set(agent.tools)
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
