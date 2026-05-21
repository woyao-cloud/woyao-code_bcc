/**
 * Plan mode state management for mini-v9.
 * Tracks whether the model is in "plan mode" (exploration + design before coding),
 * the current plan content, phase progression, and disk persistence.
 */

import { join } from 'path'
import { savePlan, loadPlan, loadLatestPlan, updatePlanPhase, completePlan, cancelPlan, listPlans, generateSlug, getPlansDir, type PlanFile } from './planStore.js'

// ============================================================
// Plan Phase Constants
// ============================================================

export const PLAN_PHASES = [
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
 */
export function enterPlanMode(plan: string, options?: { slug?: string }): { slug: string } {
  isPlanMode = true
  planContent = plan
  planResults = []

  const persisted = savePlan(plan, {
    slug: options?.slug,
    title: 'Plan',
    phase: 1,
  })
  planSlug = persisted.meta.slug
  currentPhase = 1

  return { slug: planSlug }
}

/**
 * Leave plan mode.
 * Marks the plan as completed on disk.
 */
export function leavePlanMode(): void {
  isPlanMode = false
  if (planSlug) {
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
 * Also persists to disk.
 */
export function setPlanPhase(phase: number): void {
  const clampedPhase = Math.max(1, Math.min(5, phase))
  currentPhase = clampedPhase
  if (planSlug) {
    updatePlanPhase(planSlug, clampedPhase)
  }
}

/**
 * Advance to the next phase.
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
  currentPhase = latest.meta.currentPhase
  planResults = []

  return true
}

/**
 * Get the current plan summary for prompt injection.
 */
export function getPlanSummary(): string {
  if (!isPlanMode) return ''

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
 */
export function getPlanPhaseInstructions(): string {
  if (!isPlanMode) return ''

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
    case 1:
      lines.push('### Phase 1: Explore')
      lines.push('- Use the **Agent tool** to spawn **Explore agents** in parallel (up to 3) to understand the codebase')
      lines.push('- Each Explore agent should research a different aspect: architecture, patterns, relevant files')
      lines.push('- After exploring, synthesize findings and prepare to design')
      lines.push('- When ready, move to Phase 2: Design')
      break
    case 2:
      lines.push('### Phase 2: Design')
      lines.push('- Use the **Agent tool** to spawn **Plan agents** to design implementation approaches')
      lines.push('- Consider multiple approaches and their trade-offs')
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
