import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { isInPlanMode, getPlanResults } from '../../../services/planMode.js'
import { discoverSkills } from '../../../services/skill/skillLoader.js'
import { getCwd } from '../../../bootstrap/state.js'

export const BriefTool: Tool = {
  name: 'Brief',
  description:
    'Generate a brief summary of the current session context. Shows plan status, completed steps, available skills, and active teams. Use to get oriented or share context.',
  inputSchema: {
    type: 'object',
    properties: {
      include: {
        type: 'string',
        description:
          'Comma-separated list of sections: plan, skills, teams, all (default: all)',
      },
    },
    required: [],
  },
  prompt:
    'Brief tool: generate a session context summary with plan status, skills, and team information.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const includeParam = String(input.include ?? 'all')
      .trim()
      .toLowerCase()
    const sections =
      includeParam === 'all'
        ? ['plan', 'skills', 'teams']
        : includeParam.split(',').map(s => s.trim())

    const parts: string[] = ['--- Session Brief ---']

    if (sections.includes('plan')) {
      const inPlan = isInPlanMode()
      const results = getPlanResults()
      parts.push(
        `\nPlan: ${inPlan ? 'ACTIVE' : 'inactive'} (${results.length} steps completed)`,
      )
      if (results.length > 0) {
        for (let i = 0; i < Math.min(results.length, 5); i++) {
          parts.push(`  ${i + 1}. ${results[i].slice(0, 150)}`)
        }
      }
    }

    if (sections.includes('skills')) {
      const root = ctx.cwd || getCwd()
      const skills = discoverSkills(root)
      parts.push(`\nSkills: ${skills.length} available`)
      if (skills.length > 0) {
        for (const s of skills.slice(0, 10)) {
          parts.push(`  - ${s.name}`)
        }
      }
    }

    if (sections.includes('teams')) {
      parts.push('\nTeams: (use /team list to view)')
    }

    return { content: parts.join('\n'), success: true }
  },

  userFacingName: () => 'Brief',
}
