import { existsSync } from 'fs'
import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import {
  leavePlanMode,
  addPlanResult,
  getPlanContent,
  getPlanResults,
  getPlanSlug,
  getPlanFilePath,
  isInPlanMode,
} from '../../../services/planMode.js'

export const ExitPlanModeTool: Tool = {
  name: 'ExitPlanMode',
  description:
    'Exit plan mode after completing the planning process. ' +
    'Present the final plan for user approval. ' +
    'Before calling this tool, ensure Phase 4 (writing the plan file) is complete. ' +
    'The plan, results, and file path will be included in the response.',
  inputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          'Complete summary of the agreed plan: what will be implemented, ' +
          'key files to modify, implementation order, and any architectural decisions.',
      },
    },
    required: ['summary'],
  },
  prompt:
    'ExitPlanMode tool: exit plan mode and present the final plan for approval. ' +
    'Before calling, make sure the plan has been written to the plan file. ' +
    'Include a summary of the plan, steps, files to modify, and key decisions in the summary parameter.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,
  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    // Validate: must be in plan mode
    if (!isInPlanMode()) {
      return {
        content: 'Not currently in plan mode. Use EnterPlanMode first.',
        success: false,
        error: 'Not in plan mode',
      }
    }

    // Validate: plan file should exist (Phase 4 should have been completed)
    const planFilePath = getPlanFilePath()
    if (planFilePath && !existsSync(planFilePath)) {
      return {
        content:
          'Plan file not found at: ' +
          planFilePath +
          '\n\nPlease complete Phase 4 first: write the final plan to the plan file using FileWriteTool or FileEditTool, then call ExitPlanMode.',
        success: false,
        error: 'Plan file not written',
      }
    }

    const summary = String(input.summary ?? '').trim()
    addPlanResult(summary)

    const slug = getPlanSlug()
    const planContent = getPlanContent()
    const results = getPlanResults()

    const lines: string[] = [
      '## Plan Complete — Ready for Approval',
      '',
      `Plan slug: ${slug}`,
      planFilePath ? `Plan file: ${planFilePath}` : '',
      '',
    ]

    // Plan content section
    if (planContent) {
      lines.push('### Plan Overview')
      lines.push(
        '```',
        planContent.slice(0, 1200) + (planContent.length > 1200 ? '\n...(truncated)' : ''),
        '```',
      )
    }

    // Execution results (steps completed)
    if (results.length > 0) {
      lines.push('')
      lines.push('### Steps Completed')
      results.forEach((r, i) => lines.push(`${i + 1}. ${r}`))
    }

    lines.push('')
    lines.push('Plan has been saved to disk. Proceed with implementation.')
    lines.push('')
    lines.push('Rules after exiting plan mode:')
    lines.push('- Follow the plan steps in order')
    lines.push('- Respect dependencies between steps')
    lines.push('- Run tests to verify each step')
    lines.push('- Use TaskCreate/Update to track progress')

    leavePlanMode()

    return { content: lines.join('\n'), success: true }
  },
  userFacingName: () => 'ExitPlanMode',
}
