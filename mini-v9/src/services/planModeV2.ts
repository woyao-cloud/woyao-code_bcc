/**
 * Plan Mode V2 — Enhanced planning workflow with interview phase,
 * configurable agent counts, phase hooks, per-agent plan files,
 * and cross-session continuity.
 */

import { join } from 'path'
import {
  savePlan,
  loadPlan,
  loadLatestPlan,
  updatePlanPhase,
  completePlan,
  cancelPlan,
  listPlans,
  getPlansDir,
  generateSlug,
  type PlanFile,
  type PlanMeta,
} from './planStore.js'

// ============================================================
// Constants — extended phases with Phase 0 Interview
// ============================================================

export const PLAN_PHASES_V2 = [
  {
    phase: 0,
    name: 'Interview',
    description:
      'Ask clarifying questions to understand requirements before planning',
  },
  {
    phase: 1,
    name: 'Explore',
    description: 'Explore the codebase using Explore agents',
  },
  {
    phase: 2,
    name: 'Design',
    description: 'Design implementation approach using Plan agents',
  },
  {
    phase: 3,
    name: 'Review',
    description: 'Review critical files and check alignment with requirements',
  },
  {
    phase: 4,
    name: 'Final Plan',
    description: 'Write the final plan to the plan file',
  },
  {
    phase: 5,
    name: 'Exit',
    description: 'Call ExitPlanMode to present the plan for approval',
  },
] as const

export type PlanPhaseNameV2 = (typeof PLAN_PHASES_V2)[number]['name']

// ============================================================
// Types
// ============================================================

export interface PlanModeV2Config {
  exploreAgentCount: number
  planAgentCount: number
  enableInterviewPhase: boolean
  interviewQuestions: string[]
}

export interface PlanPhaseHooks {
  onPhaseEnter?: (phase: number, slug: string) => void
  onPhaseExit?: (phase: number, slug: string) => void
  onPlanCreated?: (slug: string, title: string) => void
  onPlanCompleted?: (slug: string) => void
}

export interface AgentPlanContext {
  agentId: string
  planSlug: string
  phase: number
}

export interface PlanSummary {
  slug: string
  title: string
  status: string
  phase: number
  phaseName: string
  stepCount: number
  createdAt: string
  updatedAt: string
}

// ============================================================
// Default config
// ============================================================

const DEFAULT_CONFIG: PlanModeV2Config = {
  exploreAgentCount: 3,
  planAgentCount: 2,
  enableInterviewPhase: true,
  interviewQuestions: [],
}

// ============================================================
// State
// ============================================================

let isV2Mode = false
let config: PlanModeV2Config = { ...DEFAULT_CONFIG }
let hooks: PlanPhaseHooks = {}
let agentContexts = new Map<string, AgentPlanContext>()

// ============================================================
// Config management
// ============================================================

export function setPlanModeV2Config(
  overrides: Partial<PlanModeV2Config>,
): PlanModeV2Config {
  config = { ...config, ...overrides }
  return config
}

export function getPlanModeV2Config(): PlanModeV2Config {
  return { ...config }
}

export function setPlanModeV2Hooks(newHooks: PlanPhaseHooks): void {
  hooks = { ...newHooks }
}

export function isV2Enabled(): boolean {
  return isV2Mode
}

export function enableV2(): void {
  isV2Mode = true
}

export function disableV2(): void {
  isV2Mode = false
}

// ============================================================
// Per-agent plan tracking
// ============================================================

export function registerAgentPlanContext(
  agentId: string,
  planSlug: string,
  phase?: number,
): void {
  agentContexts.set(agentId, {
    agentId,
    planSlug,
    phase: phase ?? 0,
  })
}

export function getAgentPlanContext(
  agentId: string,
): AgentPlanContext | undefined {
  return agentContexts.get(agentId)
}

export function updateAgentPlanPhase(agentId: string, phase: number): void {
  const ctx = agentContexts.get(agentId)
  if (ctx) {
    agentContexts.set(agentId, { ...ctx, phase })
  }
}

export function unregisterAgentPlanContext(agentId: string): void {
  agentContexts.delete(agentId)
}

export function getAgentPlanSlug(agentId: string): string | undefined {
  return agentContexts.get(agentId)?.planSlug
}

// ============================================================
// Plan file helpers (per-agent)
// ============================================================

export function getAgentPlanFilePath(agentId: string): string | undefined {
  const slug = getAgentPlanSlug(agentId)
  if (!slug) return undefined
  return join(getPlansDir(), `${slug}.md`)
}

// ============================================================
// Phase transition
// ============================================================

export function notifyPhaseEnter(phase: number, slug: string): void {
  hooks.onPhaseEnter?.(phase, slug)
}

export function notifyPhaseExit(phase: number, slug: string): void {
  hooks.onPhaseExit?.(phase, slug)
}

export function notifyPlanCreated(slug: string, title: string): void {
  hooks.onPlanCreated?.(slug, title)
}

export function notifyPlanCompleted(slug: string): void {
  hooks.onPlanCompleted?.(slug)
}

// ============================================================
// Enhanced phase instructions
// ============================================================

export function getV2PhaseInstructions(
  currentPhase: number,
  planSlug?: string,
  agentCounts?: { explore?: number; plan?: number },
): string {
  if (!isV2Mode) return ''

  const ec = agentCounts?.explore ?? config.exploreAgentCount
  const pc = agentCounts?.plan ?? config.planAgentCount
  const phases = config.enableInterviewPhase
    ? PLAN_PHASES_V2
    : PLAN_PHASES_V2.filter(p => p.phase > 0)

  const lines: string[] = []
  lines.push('# Plan Mode V2 Workflow')
  lines.push('')
  lines.push(
    'You are in **Plan Mode V2** — an enhanced structured workflow for designing implementation plans.',
  )
  lines.push('')

  // Phase list
  lines.push('## Phases')
  lines.push('')
  for (const p of phases) {
    const marker =
      p.phase === currentPhase
        ? '→ **ACTIVE**'
        : p.phase < currentPhase
          ? '✓ Complete'
          : 'Pending'
    lines.push(`### Phase ${p.phase}: ${p.name} — ${marker}`)
    lines.push(p.description)
    lines.push('')
  }

  if (planSlug) {
    lines.push(`Plan slug: ${planSlug}`)
    lines.push('')
  }

  // Phase-specific guidance
  lines.push('## Current Phase Guidance')
  lines.push('')

  // Phase 0: Interview (new)
  if (currentPhase === 0 && config.enableInterviewPhase) {
    lines.push('### Phase 0: Interview')
    lines.push(
      '- Use **AskUserQuestion** to ask clarifying questions about the task:',
    )
    lines.push('  - What are the exact requirements and acceptance criteria?')
    lines.push(
      '  - Are there any constraints or preferences (performance, security, compatibility)?',
    )
    lines.push('  - What is the priority: correctness, speed, maintainability?')
    lines.push('  - Are there existing patterns or designs to follow?')
    lines.push('- Ask questions one at a time to keep the conversation focused')
    lines.push('- Collect the answers and incorporate them into the plan')
    lines.push('- When you have enough clarity, advance to Phase 1: Explore')
    lines.push('')
    lines.push(
      'IMPORTANT: Do NOT skip to exploring yet. First gather requirements.',
    )
    return lines.join('\n')
  }

  // Phase 1: Explore — enhanced with configurable agent count
  if (currentPhase === 1) {
    lines.push('### Phase 1: Explore')
    lines.push(
      `- Launch **${ec} Explore agents in parallel** to understand the codebase from different angles:`,
    )
    const exploreTasks = [
      'Explore the overall architecture and project structure',
      'Find existing patterns and similar features as reference',
      'Trace relevant code paths and identify key files',
    ]
    for (let i = 0; i < ec; i++) {
      const task =
        exploreTasks[i % exploreTasks.length] ??
        'Analyze codebase from a unique perspective'
      lines.push(`  - Agent ${i + 1} (Explore): "${task}"`)
    }
    lines.push(
      `- Launch all ${ec} agents simultaneously so they run in parallel`,
    )
    lines.push('- After all agents complete, synthesize their findings')
    lines.push('- When ready, advance to Phase 2: Design')
    return lines.join('\n')
  }

  // Phase 2: Design — enhanced with configurable agent count
  if (currentPhase === 2) {
    lines.push('### Phase 2: Design')
    lines.push(
      `- Use the **Agent tool** to spawn **${pc} Plan agents** to design implementation approaches:`,
    )
    const planTasks = [
      'Focused on architecture and structure',
      'Focused on implementation details and edge cases',
    ]
    for (let i = 0; i < pc; i++) {
      const task =
        planTasks[i % planTasks.length] ??
        'Design approach from a unique perspective'
      lines.push(`  - Agent ${i + 1} (Plan): ${task}`)
    }
    lines.push(`- Synthesize the best of both approaches`)
    lines.push('- Identify files to modify, dependencies, and risks')
    lines.push('- When ready, advance to Phase 3: Review')
    return lines.join('\n')
  }

  // Phase 3: Review
  if (currentPhase === 3) {
    lines.push('### Phase 3: Review')
    lines.push('- Read and review critical files identified in the design')
    lines.push('- Check alignment with the user request')
    lines.push('- Use AskUserQuestion to clarify any ambiguities')
    lines.push('- When ready, advance to Phase 4: Final Plan')
    return lines.join('\n')
  }

  // Phase 4: Final Plan
  if (currentPhase === 4) {
    const planFilePath = planSlug
      ? join(getPlansDir(), `${planSlug}.md`)
      : 'the plan file'
    lines.push('### Phase 4: Final Plan')
    lines.push('- Write the final plan to the plan file using FileWrite/Edit')
    lines.push(`- The plan file is at: ${planFilePath}`)
    lines.push('- Include: steps, files to touch, dependencies, risks')
    lines.push('- When complete, advance to Phase 5: Exit')
    return lines.join('\n')
  }

  // Phase 5: Exit
  if (currentPhase === 5) {
    lines.push('### Phase 5: Exit')
    lines.push('- Call ExitPlanMode to present your plan for approval')
    lines.push('- The plan will be summarized for user approval')
    return lines.join('\n')
  }

  // Generic fallback
  lines.push(
    `You are in Phase ${currentPhase}. Follow the phase instructions above.`,
  )

  // Rules
  lines.push('')
  lines.push('## Rules')
  lines.push('- **DO NOT** write or edit any files except the plan file')
  lines.push('- **DO NOT** execute destructive operations')
  lines.push('- Use **Read** and **Explore agents** for codebase research')
  lines.push('- Use **AskUserQuestion** to clarify requirements')

  return lines.join('\n')
}

// ============================================================
// Plan summary for cross-session continuity
// ============================================================

export function buildPlanSummary(
  slug: string,
  options?: {
    includeContent?: boolean
  },
): PlanSummary | null {
  const plan = loadPlan(slug)
  if (!plan) return null

  const phaseInfo = PLAN_PHASES_V2.find(p => p.phase === plan.meta.currentPhase)

  return {
    slug: plan.meta.slug,
    title: plan.meta.title,
    status: plan.meta.status,
    phase: plan.meta.currentPhase,
    phaseName: phaseInfo?.name ?? `Phase ${plan.meta.currentPhase}`,
    stepCount: plan.content
      .split('\n')
      .filter(l => l.trim().startsWith('- [') || l.trim().startsWith('* ['))
      .length,
    createdAt: plan.meta.createdAt,
    updatedAt: plan.meta.updatedAt,
  }
}

export function getV2PlanSummaryForPrompt(slug: string): string {
  const summary = buildPlanSummary(slug)
  if (!summary) return ''

  return [
    '## Previous Plan Session',
    `- Title: ${summary.title}`,
    `- Status: ${summary.status}`,
    `- Phase: ${summary.phase} — ${summary.phaseName}`,
    `- Steps identified: ${summary.stepCount}`,
    `- Last updated: ${summary.updatedAt}`,
    '',
    'Resume from the current phase to continue the planning process.',
  ].join('\n')
}

// ============================================================
// List recent plans for session resume
// ============================================================

export function listRecentPlans(limit?: number): PlanSummary[] {
  const allPlans = listPlans()
  const sorted = [...allPlans].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
  const limited = limit ? sorted.slice(0, limit) : sorted

  return limited.map(meta => {
    const phaseInfo = PLAN_PHASES_V2.find(p => p.phase === meta.currentPhase)
    const plan = loadPlan(meta.slug)
    return {
      slug: meta.slug,
      title: meta.title,
      status: meta.status,
      phase: meta.currentPhase,
      phaseName: phaseInfo?.name ?? `Phase ${meta.currentPhase}`,
      stepCount: plan
        ? plan.content
            .split('\n')
            .filter(
              l => l.trim().startsWith('- [') || l.trim().startsWith('* ['),
            ).length
        : 0,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    }
  })
}

// ============================================================
// Reset (for testing)
// ============================================================

export function resetV2State(): void {
  isV2Mode = false
  config = { ...DEFAULT_CONFIG }
  hooks = {}
  agentContexts.clear()
}
