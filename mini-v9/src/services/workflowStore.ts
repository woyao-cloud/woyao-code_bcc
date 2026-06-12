/**
 * Workflow persistence store for mini-v9.
 * Workflows are saved as JSON files to ~/.claude-code-mini/workflows/{id}.json.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logDebug, logError } from '../utils/log.js'
import type {
  Workflow,
  WorkflowStatus,
  StepStatus,
  WorkflowStep,
  WorkflowSummary,
  CreateWorkflowInput,
  UpdateStepInput,
} from '../tools/builtin/WorkflowTool/types.js'

const WORKFLOWS_DIR = join(homedir(), '.claude-code-mini', 'workflows')

// ============================================================
// Helpers
// ============================================================

function ensureDir(): string {
  if (!existsSync(WORKFLOWS_DIR)) {
    mkdirSync(WORKFLOWS_DIR, { recursive: true })
  }
  return WORKFLOWS_DIR
}

function filePath(id: string): string {
  return join(WORKFLOWS_DIR, `${id}.json`)
}

function writeToDisk(wf: Workflow): void {
  ensureDir()
  try {
    writeFileSync(filePath(wf.id), JSON.stringify(wf, null, 2), 'utf-8')
  } catch (err) {
    logError(`Failed to persist workflow ${wf.id}: ${err}`)
  }
}

function deleteFromDisk(id: string): void {
  try {
    const path = filePath(id)
    if (existsSync(path)) unlinkSync(path)
  } catch (err) {
    logError(`Failed to delete workflow file ${id}: ${err}`)
  }
}

function loadAllFromDisk(): Map<string, Workflow> {
  const workflows = new Map<string, Workflow>()
  if (!existsSync(WORKFLOWS_DIR)) return workflows

  try {
    const files = readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        const raw = readFileSync(filePath(file.replace(/\.json$/, '')), 'utf-8')
        const wf = JSON.parse(raw) as Workflow
        workflows.set(wf.id, wf)
      } catch {
        // skip corrupt files
      }
    }
  } catch {
    // skip unreadable directory
  }

  return workflows
}

function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ============================================================
// Store
// ============================================================

let workflows = new Map<string, Workflow>()

export function initializeWorkflowStore(): void {
  workflows = loadAllFromDisk()
  logDebug(
    `Workflow store initialized: ${workflows.size} workflows loaded from disk`,
  )
}

export function resetWorkflowStore(): void {
  if (existsSync(WORKFLOWS_DIR)) {
    const files = readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        unlinkSync(join(WORKFLOWS_DIR, file))
      } catch {
        // ignore
      }
    }
  }
  workflows.clear()
}

// ============================================================
// CRUD
// ============================================================

export function createWorkflow(input: CreateWorkflowInput): Workflow {
  const id = generateId()
  const now = new Date().toISOString()

  const phases = input.phases.map((p, i) => ({
    name: p.name,
    description: p.description,
    order: i + 1,
  }))

  const steps: WorkflowStep[] = input.steps.map(s => ({
    id: generateId(),
    name: s.name,
    description: s.description,
    phase: s.phase,
    status: 'pending' as StepStatus,
    assignee: s.assignee,
  }))

  const workflow: Workflow = {
    id,
    title: input.title,
    description: input.description,
    status: 'active' as WorkflowStatus,
    phases,
    steps,
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata,
  }

  workflows.set(id, workflow)
  writeToDisk(workflow)
  logDebug(`Workflow created: ${id} — ${input.title}`)
  return workflow
}

export function getWorkflow(id: string): Workflow | undefined {
  return workflows.get(id)
}

export function updateWorkflowStatus(
  id: string,
  status: WorkflowStatus,
): Workflow | undefined {
  const wf = workflows.get(id)
  if (!wf) return undefined

  const updated: Workflow = {
    ...wf,
    status,
    updatedAt: new Date().toISOString(),
  }
  workflows.set(id, updated)
  writeToDisk(updated)
  return updated
}

export function updateStep(
  id: string,
  stepId: string,
  input: UpdateStepInput,
): WorkflowStep | undefined {
  const wf = workflows.get(id)
  if (!wf) return undefined

  const stepIndex = wf.steps.findIndex(s => s.id === stepId)
  if (stepIndex < 0) return undefined

  const now = new Date().toISOString()
  const existing = wf.steps[stepIndex]
  if (!existing) return undefined

  const updatedStep: WorkflowStep = {
    ...existing,
    status: input.status ?? existing.status,
    result: input.result ?? existing.result,
    assignee: input.assignee ?? existing.assignee,
    startedAt:
      input.status === 'in_progress' && !existing.startedAt
        ? now
        : existing.startedAt,
    completedAt:
      input.status === 'completed' || input.status === 'failed'
        ? now
        : existing.completedAt,
  }

  const newSteps = [...wf.steps]
  newSteps[stepIndex] = updatedStep

  const updated: Workflow = { ...wf, steps: newSteps, updatedAt: now }

  // Auto-complete workflow if all steps completed/failed/skipped
  if (
    updated.steps.every(
      s =>
        s.status === 'completed' ||
        s.status === 'failed' ||
        s.status === 'skipped',
    )
  ) {
    updated.status = 'completed'
  }

  workflows.set(id, updated)
  writeToDisk(updated)
  return updatedStep
}

export function listWorkflows(filter?: {
  status?: WorkflowStatus
}): Workflow[] {
  const all = Array.from(workflows.values()).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )
  if (filter?.status) {
    return all.filter(w => w.status === filter.status)
  }
  return all
}

export function getWorkflowSummaries(filter?: {
  status?: WorkflowStatus
}): WorkflowSummary[] {
  const all = listWorkflows(filter)
  return all.map(wf => ({
    id: wf.id,
    title: wf.title,
    status: wf.status,
    phaseCount: wf.phases.length,
    stepCount: wf.steps.length,
    completedSteps: wf.steps.filter(s => s.status === 'completed').length,
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
  }))
}

export function getWorkflowProgress(id: string): string | undefined {
  const wf = workflows.get(id)
  if (!wf) return undefined

  const total = wf.steps.length
  const completed = wf.steps.filter(s => s.status === 'completed').length
  const inProgress = wf.steps.filter(s => s.status === 'in_progress').length
  const failed = wf.steps.filter(s => s.status === 'failed').length

  const lines: string[] = []
  lines.push(`Workflow: ${wf.title} (${wf.id})`)
  lines.push(`Status: ${wf.status}`)
  lines.push(`Progress: ${completed}/${total} steps completed`)

  if (inProgress > 0) lines.push(`In progress: ${inProgress}`)
  if (failed > 0) lines.push(`Failed: ${failed}`)

  lines.push('')
  lines.push('### Phases')

  for (const phase of wf.phases) {
    const phaseSteps = wf.steps.filter(s => s.phase === phase.order)
    const phaseCompleted = phaseSteps.filter(
      s => s.status === 'completed',
    ).length
    const phaseTotal = phaseSteps.length
    lines.push(
      `Phase ${phase.order}: ${phase.name} (${phaseCompleted}/${phaseTotal})`,
    )

    for (const step of phaseSteps) {
      const statusIcon =
        step.status === 'completed'
          ? '[✓]'
          : step.status === 'in_progress'
            ? '[→]'
            : step.status === 'failed'
              ? '[✗]'
              : step.status === 'skipped'
                ? '[-]'
                : '[ ]'
      lines.push(`  ${statusIcon} ${step.name}`)
      if (step.assignee) lines.push(`    Assignee: ${step.assignee}`)
      if (step.result) lines.push(`    Result: ${step.result.slice(0, 200)}`)
    }
  }

  return lines.join('\n')
}
