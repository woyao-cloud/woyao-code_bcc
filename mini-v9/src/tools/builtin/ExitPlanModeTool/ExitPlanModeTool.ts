import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { leavePlanMode, addPlanResult } from '../../../services/planMode.js'

export const ExitPlanModeTool: Tool = {
  name: 'ExitPlanMode',
  description: 'Exit plan mode after approval. Summarize the agreed plan.',
  inputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Agreed plan summary' },
    },
    required: ['summary'],
  },
  prompt: 'ExitPlanMode tool: exit plan mode.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    leavePlanMode()
    const summary = String(input.summary ?? '')
    addPlanResult(summary)
    return { content: 'Plan approved. Executing: ' + summary, success: true }
  },
  userFacingName: () => 'ExitPlanMode',
}
