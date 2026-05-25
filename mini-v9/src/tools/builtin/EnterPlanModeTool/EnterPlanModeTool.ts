import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { enterPlanMode, getPlanPhaseInstructions } from '../../../services/planMode.js'
import { isV2Enabled, setPlanModeV2Config } from '../../../services/planModeV2.js'

export const EnterPlanModeTool: Tool = {
  name: 'EnterPlanMode',
  description:
    'Enter plan mode for complex tasks requiring exploration and design. ' +
    'In plan mode, you follow a structured workflow: Interview → Explore → Design → Review → Final Plan → Exit. ' +
    'Use this when the task is non-trivial, involves architectural decisions, or has multiple valid approaches. ' +
    'V2 mode adds an optional Interview phase (Phase 0) for requirement gathering before exploration.',
  inputSchema: {
    type: 'object',
    properties: {
      plan: { type: 'string', description: 'Initial proposed plan or approach summary' },
      interview: {
        type: 'boolean',
        description: 'Enable Interview phase (Phase 0) to ask clarifying questions before exploring. Default: true in V2 mode.',
      },
      exploreAgentCount: {
        type: 'number',
        description: 'Number of parallel Explore agents to launch (default: 3).',
      },
      planAgentCount: {
        type: 'number',
        description: 'Number of parallel Plan agents to launch (default: 2).',
      },
    },
    required: ['plan'],
  },
  prompt:
    'EnterPlanMode tool: transition to plan mode for structured exploration and design. ' +
    'The workflow will guide you through interviewing (optional), exploring the codebase, designing a solution, ' +
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
    const enableV2 = isV2Enabled()

    // Configure V2 settings when in V2 mode
    if (enableV2) {
      const interview = input.interview !== false // default true
      const exploreCount = typeof input.exploreAgentCount === 'number'
        ? Math.max(1, Math.min(10, input.exploreAgentCount))
        : 3
      const planCount = typeof input.planAgentCount === 'number'
        ? Math.max(1, Math.min(10, input.planAgentCount))
        : 2

      setPlanModeV2Config({
        enableInterviewPhase: interview,
        exploreAgentCount: exploreCount,
        planAgentCount: planCount,
      })
    }

    const { slug } = enterPlanMode(plan)

    const resultParts: string[] = [
      `Entered plan mode (slug: ${slug}).`,
      '',
    ]

    if (enableV2) {
      resultParts.push(
        'V2 mode enabled with:',
        `- Interview phase: ${input.interview !== false ? 'enabled' : 'disabled'}`,
        `- Explore agents: ${input.exploreAgentCount ?? 3}`,
        `- Plan agents: ${input.planAgentCount ?? 2}`,
        '',
      )
    }

    resultParts.push(
      'Follow the phased workflow below. Progress through each phase naturally as you explore, design, and finalize the plan.',
      '',
      getPlanPhaseInstructions(),
    )

    return { content: resultParts.join('\n'), success: true }
  },
  userFacingName: () => 'EnterPlanMode',
}
