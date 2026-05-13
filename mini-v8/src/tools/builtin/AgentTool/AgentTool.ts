// ============================================================
// AgentTool for mini-v8
// ============================================================
// Tool wrapper that spawns subagents.
// Analogous to the Agent tool in the full Claude Code.
// ============================================================

import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { runAgent } from '../../../agents/agentRunner.js'
import type { AgentResult } from '../../../agents/agentTypes.js'
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
  },
  required: ['subagent_type', 'description', 'prompt'],
}

export const AgentTool: Tool = {
  name: 'Agent',
  description:
    'Spawn a subagent to handle complex, multi-step research or implementation tasks autonomously. Available agent types: Explore (codebase search), Plan (planning), general-purpose (research + implementation), worker (coordinator tasks), Verify (code review).',
  inputSchema: AGENT_TOOL_SCHEMA,
  prompt:
    'Use the Agent tool to spawn subagents for complex tasks. Each subagent runs autonomously with its own context, tools, and constraints. Choose the right agent type for the task: Explore for codebase searching, Plan for planning, general-purpose for research/implementation, Verify for code review.',
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const agentType = String(input.subagent_type ?? 'general-purpose')
    const description = String(input.description ?? 'agent task')
    const prompt = String(input.prompt ?? '')
    const model = input.model ? String(input.model) : undefined

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

    try {
      const result: AgentResult = await runAgent({
        agent: agentType,
        task: prompt,
        model,
      })

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
      } else {
        return {
          content: `Agent [${agentType}] failed: ${result.error || 'Unknown error'}`,
          success: false,
          error: result.error,
          metadata: {
            agentId: result.agentId,
            status: result.status,
          },
        }
      }
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
