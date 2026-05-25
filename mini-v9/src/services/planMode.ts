/**
 * Plan mode state management for mini-v9.
 * Tracks whether the model is in "plan mode" (exploration + design before coding),
 * the current plan content, phase progression, and disk persistence.
 */

import { join } from 'path'
import { savePlan, loadPlan, loadLatestPlan, updatePlanPhase, completePlan, cancelPlan, listPlans, generateSlug, getPlansDir, type PlanFile } from './planStore.js'
import {
  isV2Enabled,
  getV2PhaseInstructions,
  getV2PlanSummaryForPrompt,
  notifyPhaseEnter,
  notifyPhaseExit,
  notifyPlanCreated,
  notifyPlanCompleted,
  buildPlanSummary,
  registerAgentPlanContext,
  getAgentPlanContext,
} from './planModeV2.js'

// ============================================================
// Plan Phase Constants (extended with Phase 0 Interview)
// ============================================================

export const PLAN_PHASES = [
  { phase: 0, name: 'Interview', description: 'Ask clarifying questions to understand requirements before planning' },
  { phase: 1, name: 'Explore', description: 'Explore the codebase using Explore agents' },
  { phase: 2, name: 'Design', description: 'Design implementation approach using Plan agents' },
  { phase: 3, name: 'Review', description: 'Review critical files and check alignment with requirements' },
  { phase: 4, name: 'Final Plan', description: 'Write the final plan to the plan file' },
  { phase: 5, name: 'Exit', description: 'Call ExitPlanMode to present the plan for approval' },
] as const

export type PlanPhaseName = (typeof PLAN_PHASES)[number]['name']

// ============================================================
// State
// ============================================================

let isPlanMode = false
let planContent = ''
let planSlug = ''
let currentPhase = 1
let planResults: string[] = []

// ============================================================
// Core API
// ============================================================

export function isInPlanMode(): boolean {
  return isPlanMode
}

export function getPlanContent(): string {
  return planContent
}

export function getPlanSlug(): string {
  return planSlug
}

export function getCurrentPhase(): number {
  return currentPhase
}

export function getPlanResults(): string[] {
  return [...planResults]
}

/**
 * Enter plan mode with an initial plan proposal.
 * Persists the plan to disk and sets up in-memory state.
 * When V2 interview phase is enabled, starts at phase 0.
 */
export function enterPlanMode(plan?: string, options?: {
  slug?: string
  startPhase?: number
  title?: string
  agentId?: string
}): { slug: string } {
  isPlanMode = true
  planContent = plan ?? ''
  planResults = []

  const startPhase = options?.startPhase ?? (isV2Enabled() ? 0 : 1)
  const title = options?.title ?? 'Plan'

  const persisted = savePlan(plan ?? '', {
    slug: options?.slug,
    title,
    phase: startPhase,
  })
  planSlug = persisted.meta.slug
  currentPhase = startPhase

  // Register agent context if agentId provided
  if (options?.agentId) {
    registerAgentPlanContext(options.agentId, planSlug, startPhase)
  }

  notifyPlanCreated(planSlug, title)

  return { slug: planSlug }
}

/**
 * Leave plan mode.
 * Marks the plan as completed on disk.
 */
export function leavePlanMode(): void {
  isPlanMode = false
  if (planSlug) {
    notifyPlanCompleted(planSlug)
    completePlan(planSlug)
  }
}

/**
 * Add a result/outcome from a plan execution step.
 */
export function addPlanResult(result: string): void {
  planResults.push(result)
}

/**
 * Set the current phase of the plan.
 * Also persists to disk. Supports phase 0 (Interview).
 * Fires V2 phase transition hooks if enabled.
 */
export function setPlanPhase(phase: number): void {
  const clampedPhase = Math.max(0, Math.min(5, phase))
  const prevPhase = currentPhase
  currentPhase = clampedPhase

  if (planSlug) {
    notifyPhaseExit(prevPhase, planSlug)
    updatePlanPhase(planSlug, clampedPhase)
    notifyPhaseEnter(clampedPhase, planSlug)
  }
}

/**
 * Advance to the next phase (0 → 5).
 */
export function advancePlanPhase(): number {
  const next = Math.min(5, currentPhase + 1)
  setPlanPhase(next)
  return next
}

/**
 * Get the current phase info.
 */
export function getCurrentPhaseInfo(): { phase: number; name: string; description: string } {
  const info = PLAN_PHASES.find(p => p.phase === currentPhase)
  return info ?? { phase: currentPhase, name: `Phase ${currentPhase}`, description: '' }
}

/**
 * Update the plan content (typically after phase 4 writes the final plan).
 */
export function updatePlanContent(content: string): void {
  planContent = content
  if (planSlug) {
    savePlan(content, { slug: planSlug, title: 'Plan', phase: currentPhase })
  }
}

/**
 * Recover plan state from disk (for session resume).
 * Returns true if a plan was recovered.
 */
export function recoverPlanState(): boolean {
  const latest = loadLatestPlan()
  if (!latest || latest.meta.status !== 'active') return false

  isPlanMode = true
  planContent = latest.content
  planSlug = latest.meta.slug
  currentPhase = latest.meta.currentPhase >= 0 ? latest.meta.currentPhase : 1
  planResults = []

  return true
}

/**
 * Get the current plan summary for prompt injection.
 * Delegates to V2 for enhanced summary when enabled.
 */
export function getPlanSummary(): string {
  if (!isPlanMode) return ''

  // V2 mode: use enhanced summary
  if (isV2Enabled() && planSlug) {
    const v2Summary = getV2PlanSummaryForPrompt(planSlug)
    if (v2Summary) {
      const phaseInfo = getCurrentPhaseInfo()
      const extraLines: string[] = []
      extraLines.push(`## Current Plan Mode`)
      extraLines.push(`- Phase: ${phaseInfo.phase}/5 — ${phaseInfo.name}`)
      extraLines.push(`- Plan slug: ${planSlug}`)
      if (planContent) {
        extraLines.push(`- Plan: ${planContent.slice(0, 500)}${planContent.length > 500 ? '...' : ''}`)
      }
      if (planResults.length > 0) {
        extraLines.push(`- Steps completed: ${planResults.length}`)
      }
      return v2Summary + '\n' + extraLines.join('\n')
    }
  }

  // Legacy mode
  const phaseInfo = getCurrentPhaseInfo()
  const lines: string[] = []
  lines.push(`## Current Plan Mode`)
  lines.push(`- Phase: ${phaseInfo.phase}/5 — ${phaseInfo.name}`)
  lines.push(`- Plan slug: ${planSlug}`)
  if (planContent) {
    lines.push(`- Plan: ${planContent.slice(0, 500)}${planContent.length > 500 ? '...' : ''}`)
  }
  if (planResults.length > 0) {
    lines.push(`- Steps completed: ${planResults.length}`)
  }

  return lines.join('\n')
}

/**
 * Get the plan mode workflow instructions for the given phase.
 * Uses V2 enhanced instructions when V2 mode is enabled.
 */
export function getPlanPhaseInstructions(): string {
  if (!isPlanMode) return ''

  // V2 mode: delegate to planModeV2 for enhanced instructions
  if (isV2Enabled()) {
    return getV2PhaseInstructions(currentPhase, planSlug, undefined)
  }

  // Legacy mode (preserved for backward compatibility)
  const phaseInfo = getCurrentPhaseInfo()
  const pendingPhases = PLAN_PHASES.filter(p => p.phase >= currentPhase)

  const lines: string[] = []
  lines.push('# Plan Mode Workflow')
  lines.push('')
  lines.push('You are in **Plan Mode** — a structured workflow for designing implementation plans before writing code.')
  lines.push('')
  lines.push('## Phases')
  lines.push('')

  for (const p of PLAN_PHASES) {
    const marker = p.phase === currentPhase ? '→ **ACTIVE**' : p.phase < currentPhase ? '✓ Complete' : 'Pending'
    lines.push(`### Phase ${p.phase}: ${p.name} — ${marker}`)
    lines.push(p.description)
    lines.push('')
  }

  // Phase-specific guidance
  lines.push('## Current Phase Guidance')
  lines.push('')

  switch (currentPhase) {
    case 0:
      lines.push('### Phase 0: Interview')
      lines.push('- Use **AskUserQuestion** to ask clarifying questions about the task:')
      lines.push('  - What are the exact requirements and acceptance criteria?')
      lines.push('  - Are there any constraints or preferences (performance, security, compatibility)?')
      lines.push('  - What is the priority: correctness, speed, maintainability?')
      lines.push('  - Are there existing patterns or designs to follow?')
      lines.push('- Ask questions one at a time to keep the conversation focused')
      lines.push('- Collect the answers and incorporate them into the plan')
      lines.push('- When you have enough clarity, advance to Phase 1: Explore')
      lines.push('')
      lines.push('IMPORTANT: Do NOT skip to exploring yet. First gather requirements.')
      break
    case 1:
      lines.push('### Phase 1: Explore')
      lines.push('- **Launch multiple Explore agents in parallel** (2-3) to understand the codebase from different angles:')
      lines.push('  - Agent 1: Explore the overall architecture and project structure')
      lines.push('  - Agent 2: Find existing patterns and similar features as reference')
      lines.push('  - Agent 3: Trace relevant code paths and identify key files')
      lines.push('- Use the Agent tool with agentType: "Explore" for each')
      lines.push('- Launch all agents simultaneously so they run in parallel')
      lines.push('- After all agents complete, synthesize their findings')
      lines.push('- When ready, move to Phase 2: Design')
      break
    case 2:
      lines.push('### Phase 2: Design')
      lines.push('- Use the **Agent tool** to spawn **Plan agents** to design implementation approaches')
      lines.push('- Consider launching 2 Plan agents with different perspectives:')
      lines.push('  - One focused on architecture and structure')
      lines.push('  - One focused on implementation details and edge cases')
      lines.push('- Synthesize the best of both approaches')
      lines.push('- Identify files to modify, dependencies, and risks')
      lines.push('- When ready, move to Phase 3: Review')
      break
    case 3:
      lines.push('### Phase 3: Review')
      lines.push('- Read and review critical files identified in the design')
      lines.push('- Check alignment with the user request')
      lines.push('- Use AskUserQuestion to clarify any ambiguities')
      lines.push('- When ready, move to Phase 4: Final Plan')
      break
    case 4:
      lines.push('### Phase 4: Final Plan')
      lines.push('- Write the final plan to the plan file using FileWrite/Edit')
      lines.push('- The plan file is at: ' + getPlanFilePath())
      lines.push('- Include: steps, files to touch, dependencies, risks')
      lines.push('- When complete, move to Phase 5: Exit')
      break
    case 5:
      lines.push('### Phase 5: Exit')
      lines.push('- Call ExitPlanMode to present your plan for approval')
      lines.push('- The plan will be summarized for user approval')
      break
  }

  lines.push('')
  lines.push('## Rules')
  lines.push('- **DO NOT** write or edit any files except the plan file')
  lines.push('- **DO NOT** execute destructive operations')
  lines.push('- Use **Read** and **Explore agents** for codebase research')
  lines.push('- Use **AskUserQuestion** to clarify requirements')

  return lines.join('\n')
}

/**
 * Get the plan file path for Phase 4 writing.
 */
export function getPlanFilePath(): string {
  return join(getPlansDir(), `${planSlug}.md`)
}

/**
 * Reset plan state (for testing).
 */
export function resetPlanState(): void {
  isPlanMode = false
  planContent = ''
  planSlug = ''
  currentPhase = 1
  planResults = []
}
