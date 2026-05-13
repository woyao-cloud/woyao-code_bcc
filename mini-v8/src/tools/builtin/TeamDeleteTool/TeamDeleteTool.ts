// ============================================================
// TeamDeleteTool for mini-v8
// ============================================================
// Tool for disbanding multi-agent swarm teams.
// ============================================================

import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { deleteTeam, getTeam } from '../../../agents/teamManager.js'

const TEAM_DELETE_SCHEMA = {
  type: 'object' as const,
  properties: {
    wait_ms: {
      type: 'number',
      description:
        'Optional time to wait for active teammates to finish before cleanup (max 30000ms).',
    },
  },
}

export const TeamDeleteTool: Tool = {
  name: 'TeamDelete',
  description:
    'Clean up and disband a team when the collaborative work is complete. This frees team resources and removes the team definition.',
  inputSchema: TEAM_DELETE_SCHEMA,
  prompt:
    'Use TeamDelete to disband a team when all collaborative work is complete. This cleans up team resources and marks the swarm as finished.',
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    // Get team name from context or input
    // For simplicity, teams are tracked by agent context
    const teamNames = Array.from(
      new Set(
        Array.from(
          ((globalThis as unknown as Record<string, unknown>)
            .__activeTeamNames as string[]) ?? [],
        ),
      ),
    )

    if (teamNames.length === 0) {
      return {
        content: 'No active team found. Nothing to delete.',
        success: true,
      }
    }

    const results: string[] = []

    for (const teamName of teamNames) {
      const team = getTeam(teamName)
      if (!team) {
        results.push(`Team "${teamName}" not found (already deleted?).`)
        continue
      }

      const waitMs = typeof input.wait_ms === 'number' ? input.wait_ms : 0

      // If wait specified, delay briefly
      if (waitMs > 0) {
        await new Promise(resolve =>
          setTimeout(resolve, Math.min(waitMs, 30000)),
        )
      }

      const outcome = deleteTeam(teamName)
      results.push(`${outcome.message}`)
    }

    return {
      content: results.join('\n'),
      success: true,
      metadata: {
        teamsCleaned: teamNames.length,
      },
    }
  },
  userFacingName(): string {
    return 'Delete Team'
  },
}
