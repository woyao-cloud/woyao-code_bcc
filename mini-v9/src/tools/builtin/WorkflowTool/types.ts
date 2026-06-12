/**
 * Workflow type definitions for mini-v9.
 */

export type WorkflowStatus = 'active' | 'completed' | 'cancelled'

export type StepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped'

export interface WorkflowPhase {
  name: string
  description: string
  order: number
}

export interface WorkflowStep {
  id: string
  name: string
  description: string
  phase: number
  status: StepStatus
  assignee?: string
  result?: string
  startedAt?: string
  completedAt?: string
}

export interface Workflow {
  id: string
  title: string
  description: string
  status: WorkflowStatus
  phases: WorkflowPhase[]
  steps: WorkflowStep[]
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface WorkflowSummary {
  id: string
  title: string
  status: WorkflowStatus
  phaseCount: number
  stepCount: number
  completedSteps: number
  createdAt: string
  updatedAt: string
}

export interface CreateWorkflowInput {
  title: string
  description: string
  phases: Array<{
    name: string
    description: string
  }>
  steps: Array<{
    name: string
    description: string
    phase: number
    assignee?: string
  }>
  metadata?: Record<string, unknown>
}

export interface UpdateStepInput {
  id: string
  status?: StepStatus
  result?: string
  assignee?: string
}
