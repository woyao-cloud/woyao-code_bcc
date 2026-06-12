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
import { isV2Enabled, buildPlanSummary } from '../../../services/planModeV2.js'

export const ExitPlanModeTool: Tool = {
  name: 'ExitPlanMode',
  description:
    'Exit plan mode after completing the planning process. ' +
    'Present the final plan for user approval. ' +
    'Before calling this tool, ensure Phase 4 (writing the plan file) is complete. ' +
    'The plan, results, and file path will be included in the response. ' +
    'In V2 mode, includes enhanced approval summary with execution plan details.',
  inputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          'Complete summary of the agreed plan: what will be implemented, ' +
          'key files to modify, implementation order, and any architectural decisions.',
      },
      implementation_steps: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Ordered list of implementation steps for execution tracking (V2 mode).',
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
    const implementationSteps = input.implementation_steps as
      | string[]
      | undefined

    const lines: string[] = [
      '## Plan Complete — Ready for Approval',
      '',
      `Plan slug: ${slug}`,
      planFilePath ? `Plan file: ${planFilePath}` : '',
      '',
    ]

    // V2 mode: enhanced approval summary
    if (isV2Enabled() && slug) {
      const v2Summary = buildPlanSummary(slug)
      if (v2Summary) {
        lines.push('### Execution Plan')
        lines.push(`- Status: ${v2Summary.status}`)
        lines.push(
          `- Phase completed: ${v2Summary.phase} — ${v2Summary.phaseName}`,
        )
        lines.push(`- Steps identified: ${v2Summary.stepCount}`)
        lines.push(`- Created: ${v2Summary.createdAt}`)
        lines.push(`- Last updated: ${v2Summary.updatedAt}`)
        lines.push('')
      }
    }

    // Implementation steps
    if (implementationSteps && implementationSteps.length > 0) {
      lines.push('### Implementation Steps')
      lines.push('These steps should be executed in order after plan approval:')
      lines.push('')
      implementationSteps.forEach((step, i) => {
        lines.push(`${i + 1}. ${step}`)
      })
      lines.push('')
    }

    // Plan content section
    if (planContent) {
      lines.push('### Plan Overview')
      lines.push(
        '```',
        planContent.slice(0, 1200) +
          (planContent.length > 1200 ? '\n...(truncated)' : ''),
        '```',
      )
    }

    // Execution results (steps completed)
    if (results.length > 0) {
      lines.push('')
      lines.push('### Steps Completed During Planning')
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
