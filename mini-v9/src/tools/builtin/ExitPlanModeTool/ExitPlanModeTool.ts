import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { leavePlanMode, addPlanResult, getPlanContent, getPlanResults, getPlanSlug, getPlanFilePath } from '../../../services/planMode.js'

export const ExitPlanModeTool: Tool = {
  name: 'ExitPlanMode',
  description:
    'Exit plan mode after completing the planning process. ' +
    'Present the final plan for user approval. The plan, results, and file path will be included in the response.',
  inputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Summary of the agreed plan and key decisions' },
    },
    required: ['summary'],
  },
  prompt:
    'ExitPlanMode tool: exit plan mode and present the final plan for approval. ' +
    'Include a summary of the plan, steps, files to modify, and key decisions.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const summary = String(input.summary ?? '').trim()
    addPlanResult(summary)

    const slug = getPlanSlug()
    const planContent = getPlanContent()
    const results = getPlanResults()

    const lines: string[] = [
      '## Plan Mode Exited',
      '',
      `### Plan slug: ${slug}`,
      getPlanFilePath() ? `Plan file: ${getPlanFilePath()}` : '',
      '',
      '### Original Plan',
      planContent ? `\`\`\`\n${planContent.slice(0, 1000)}${planContent.length > 1000 ? '\n...(truncated)' : ''}\n\`\`\`` : '(no plan content)',
      '',
      '### Execution Summary',
      ...results.map((r, i) => ` ${i + 1}. ${r}`),
      '',
      'The plan has been saved to disk. Proceed with implementation.',
    ]

    leavePlanMode()

    return { content: lines.filter(Boolean).join('\n'), success: true }
  },
  userFacingName: () => 'ExitPlanMode',
}
