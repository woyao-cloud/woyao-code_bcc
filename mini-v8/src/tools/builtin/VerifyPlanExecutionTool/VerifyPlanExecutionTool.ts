import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { isInPlanMode, getPlanResults } from '../../../services/planMode.js'

export const VerifyPlanExecutionTool: Tool = {
  name: 'VerifyPlanExecution',
  description:
    'Check the status of the current plan. Shows whether plan mode is active, what steps were planned, and what results have been collected. Use to verify that a plan is being followed correctly.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  prompt:
    'VerifyPlanExecution tool: check plan status and verify execution progress.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    _input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const inPlan = isInPlanMode()
    const results = getPlanResults()

    const lines: string[] = []
    lines.push(`Plan mode: ${inPlan ? 'ACTIVE' : 'INACTIVE'}`)
    lines.push(`Steps completed: ${results.length}`)

    if (results.length > 0) {
      lines.push('')
      lines.push('Execution results:')
      for (let i = 0; i < results.length; i++) {
        const summary =
          results[i].length > 200
            ? results[i].slice(0, 200) + '...'
            : results[i]
        lines.push(`  ${i + 1}. ${summary}`)
      }
    }

    if (!inPlan && results.length === 0) {
      lines.push('No plan has been created yet.')
    }

    return { content: lines.join('\n'), success: true }
  },

  userFacingName: () => 'VerifyPlanExecution',
}
