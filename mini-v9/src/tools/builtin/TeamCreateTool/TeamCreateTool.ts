// ============================================================
// TeamCreateTool for mini-v8
// ============================================================
// Tool for creating multi-agent swarm teams.
// ============================================================

import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { createTeam } from '../../../agents/teamManager.js'
import { randomUUID } from 'crypto'

const TEAM_CREATE_SCHEMA = {
  type: 'object' as const,
  properties: {
    team_name: {
      type: 'string',
      description: 'Name for the new team to create.',
    },
    description: {
      type: 'string',
      description: 'Team description/purpose.',
    },
    agent_type: {
      type: 'string',
      description:
        'Type/role of the team lead (e.g., "researcher", "test-runner").',
    },
  },
  required: ['team_name'],
}

export const TeamCreateTool: Tool = {
  name: 'TeamCreate',
  description:
    'Create a new multi-agent swarm team for collaborative work. Teams allow multiple specialized agents to coordinate on complex tasks.',
  inputSchema: TEAM_CREATE_SCHEMA,
  prompt:
    'Use TeamCreate to form a new team when a task requires multiple specialized agents working together. After creating a team, use the Agent tool to add team members.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const teamName = String(
      input.team_name ?? `team-${randomUUID().slice(0, 6)}`,
    )
    const description = input.description
      ? String(input.description)
      : undefined
    const agentType = input.agent_type ? String(input.agent_type) : undefined

    if (!teamName.trim()) {
      return {
        content: 'Error: team_name is required for TeamCreate.',
        success: false,
        error: 'Missing required input: team_name',
      }
    }

    try {
      const { team, leadMemberId } = createTeam(
        teamName,
        description,
        agentType,
      )

      const result = [
        `Team created successfully.`,
        `team_name: ${team.name}`,
        `description: ${team.description}`,
        `lead_agent_id: ${leadMemberId}`,
        `members: ${team.members.length}`,
        '',
        'Use the Agent tool to add workers to this team. Workers inherit team context and can coordinate their work.',
      ].join('\n')

      return {
        content: result,
        success: true,
        metadata: {
          teamName: team.name,
          leadAgentId: leadMemberId,
          memberCount: team.members.length,
        },
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: `Failed to create team: ${msg}`,
        success: false,
        error: msg,
      }
    }
  },
  userFacingName(): string {
    return 'Create Team'
  },
}
