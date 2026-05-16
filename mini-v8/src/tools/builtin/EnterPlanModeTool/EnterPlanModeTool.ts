import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { enterPlanMode } from '../../../services/planMode.js'

export const EnterPlanModeTool: Tool = {
  name: 'EnterPlanMode',
  description:
    'Enter plan mode. In plan mode, you think through the problem and propose a plan before executing.',
  inputSchema: {
    type: 'object',
    properties: {
      plan: { type: 'string', description: 'The proposed plan' },
    },
    required: ['plan'],
  },
  prompt: 'EnterPlanMode tool: propose plan for approval.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    enterPlanMode()
    const plan = String(input.plan ?? '')
    return { content: 'Plan mode entered:\n\n' + plan, success: true }
  },
  userFacingName: () => 'EnterPlanMode',
}
