import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { enterPlanMode, getPlanPhaseInstructions, getPlanSummary } from '../../../services/planMode.js'

export const EnterPlanModeTool: Tool = {
  name: 'EnterPlanMode',
  description:
    'Enter plan mode for complex tasks requiring exploration and design. ' +
    'In plan mode, you follow a structured 5-phase workflow: Explore → Design → Review → Final Plan → Exit. ' +
    'Use this when the task is non-trivial, involves architectural decisions, or has multiple valid approaches.',
  inputSchema: {
    type: 'object',
    properties: {
      plan: { type: 'string', description: 'Initial proposed plan or approach summary' },
    },
    required: ['plan'],
  },
  prompt:
    'EnterPlanMode tool: transition to plan mode for structured exploration and design. ' +
    'The 5-phase workflow will guide you through exploring the codebase, designing a solution, ' +
    'reviewing critical files, writing the final plan, and exiting for approval.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  maxResultSizeChars: 100_000,
  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const plan = String(input.plan ?? '').trim()
    const { slug } = enterPlanMode(plan)

    const resultParts: string[] = [
      `Entered plan mode (slug: ${slug}).`,
      '',
      'Follow the phased workflow below. Progress through each phase naturally as you explore, design, and finalize the plan.',
      '',
      getPlanPhaseInstructions(),
    ]

    return { content: resultParts.join('\n'), success: true }
  },
  userFacingName: () => 'EnterPlanMode',
}
