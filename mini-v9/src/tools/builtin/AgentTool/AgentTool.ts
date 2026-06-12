// ============================================================
// AgentTool for mini-v8
// ============================================================
// Tool wrapper that spawns subagents.
// Supports both sync (await) and async (background) execution.
// ============================================================

import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { runAgentSync, runAgentAsync } from '../../../agents/agentRunner.js'
import { runForkedAgent } from '../../../agents/forkSubagent.js'
import type {
  AgentResult,
  AgentTaskState,
  ForkConfig,
} from '../../../agents/agentTypes.js'
import { getAgent } from '../../../agents/agentRegistry.js'

/** AgentTool input schema */
const AGENT_TOOL_SCHEMA = {
  type: 'object' as const,
  properties: {
    subagent_type: {
      type: 'string',
      description:
        'The type of agent to spawn (e.g. "Explore", "Plan", "general-purpose", "worker")',
    },
    description: {
      type: 'string',
      description: 'A short (3-5 word) description of the task',
    },
    prompt: {
      type: 'string',
      description: 'The task for the agent to perform',
    },
    subagent_path: {
      type: 'string',
      description: 'Path to an agent definition file (optional)',
    },
    model: {
      type: 'string',
      description: 'Optional model override for this subagent',
    },
    run_in_background: {
      type: 'boolean',
      description:
        'Set to true to run this agent in the background. The agent will be fire-and-forget, and results will be delivered via task-notification.',
    },
    fork: {
      type: 'boolean',
      description:
        "Set to true to fork this agent as a subprocess that shares the parent's system prompt prefix for cache efficiency. " +
        'Useful for parallel research agents that explore different aspects of the same codebase.',
    },
    isolation: {
      type: 'string',
      enum: ['none', 'worktree'],
      description:
        'Isolation mode for safe agent experimentation. "worktree" creates a temporary git worktree so the agent works on an isolated copy of the repo. ' +
        'The worktree is automatically cleaned up when done.',
    },
  },
  required: ['subagent_type', 'description', 'prompt'],
}

function formatSyncResult(
  description: string,
  result: AgentResult,
): ToolResult {
  if (result.status === 'completed') {
    const outputText =
      result.content.length > 0
        ? result.content.join('\n\n')
        : '(Subagent completed but returned no output.)'

    const usageBlock = [
      '',
      `agentId: ${result.agentId}`,
      `<usage>total_tokens: ${result.totalTokens}`,
      `tool_uses: ${result.totalToolUseCount}`,
      `duration_ms: ${result.totalDurationMs}</usage>`,
    ].join('\n')

    return {
      content: `${description}:\n\n${outputText}\n${usageBlock}`,
      success: true,
      metadata: {
        agentId: result.agentId,
        status: result.status,
        totalTokens: result.totalTokens,
        toolUseCount: result.totalToolUseCount,
        durationMs: result.totalDurationMs,
      },
    }
  }

  if (result.status === 'cancelled') {
    return {
      content: `Agent [${result.agentId}] was cancelled.`,
      success: false,
      error: 'Agent cancelled',
      metadata: { agentId: result.agentId, status: result.status },
    }
  }

  return {
    content: `Agent [${result.agentId}] failed: ${result.error || 'Unknown error'}`,
    success: false,
    error: result.error,
    metadata: { agentId: result.agentId, status: result.status },
  }
}

function formatAsyncResult(
  agentType: string,
  taskState: AgentTaskState,
): ToolResult {
  return {
    content: [
      `Launched agent "${agentType}" in background.`,
      `taskId: ${taskState.taskId}`,
      `agentId: ${taskState.agentId}`,
      `Check status with /tasks or wait for task-notification.`,
    ].join('\n'),
    success: true,
    metadata: {
      status: 'async_launched',
      taskId: taskState.taskId,
      agentId: taskState.agentId,
      agentType,
    },
  }
}

export const AgentTool: Tool = {
  name: 'Agent',
  description:
    'Spawn a subagent to handle complex, multi-step research or implementation tasks autonomously. Available agent types: Explore (codebase search), Plan (planning), general-purpose (research + implementation), worker (coordinator tasks), Verify (code review). Use run_in_background: true for non-blocking execution. Use fork: true to share the parent system prompt prefix for cache-efficient parallel agents. Use isolation: "worktree" for safe filesystem experimentation in a temporary git worktree.',
  inputSchema: AGENT_TOOL_SCHEMA,
  prompt:
    'Use the Agent tool to spawn subagents for complex tasks. Each subagent runs autonomously with its own context, tools, and constraints. Choose the right agent type for the task: Explore for codebase searching, Plan for planning, general-purpose for research/implementation, Verify for code review. Set run_in_background: true to run without blocking. Set fork: true to share the parent system prompt for cache-efficient parallel execution.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const agentType = String(input.subagent_type ?? 'general-purpose')
    const description = String(input.description ?? 'agent task')
    const prompt = String(input.prompt ?? '')
    const model = input.model ? String(input.model) : undefined
    const runInBackground = input.run_in_background === true
    const fork = input.fork === true
    const isolation = String(input.isolation ?? 'none')

    if (!prompt) {
      return {
        content: 'Error: prompt is required for Agent tool.',
        success: false,
        error: 'Missing required input: prompt',
      }
    }

    // Validate agent type exists
    const agentDef = getAgent(agentType)
    if (!agentDef) {
      return {
        content: `Error: Unknown agent type "${agentType}". Available types: Explore, Plan, general-purpose, worker, Verify. Use /agent list to see all.`,
        success: false,
        error: `Unknown agent type: ${agentType}`,
      }
    }

    // Determine whether to run async
    const shouldRunAsync = runInBackground || agentDef.background === true

    try {
      if (shouldRunAsync) {
        const taskState = runAgentAsync({
          agent: agentType,
          task: prompt,
          model,
          toolUseId: ctx.toolUse.id,
        })
        return formatAsyncResult(agentType, taskState)
      }

      // Fork mode: share parent system prompt for cache efficiency
      if (fork) {
        const forkConfig: ForkConfig = {
          enabled: true,
          isolation: isolation === 'worktree' ? 'worktree' : 'none',
          maxTurns: agentDef.maxTurns,
          model: model,
        }

        const result = await runForkedAgent({
          agentType,
          prompt,
          parentMessages: ctx.messages as unknown as BetaMessageParam[],
          forkConfig,
          model,
        })
        return formatSyncResult(description, result)
      }

      const result: AgentResult = await runAgentSync({
        agent: agentType,
        task: prompt,
        model,
      })
      return formatSyncResult(description, result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: `Agent [${agentType}] execution error: ${msg}`,
        success: false,
        error: msg,
      }
    }
  },
  userFacingName(): string {
    return 'Agent'
  },
}
