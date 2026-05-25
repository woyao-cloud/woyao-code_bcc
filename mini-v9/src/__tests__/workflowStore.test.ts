import { describe, expect, test, beforeEach } from 'bun:test'
import {
  createWorkflow,
  getWorkflow,
  updateWorkflowStatus,
  updateStep,
  listWorkflows,
  getWorkflowSummaries,
  getWorkflowProgress,
  resetWorkflowStore,
} from '../services/workflowStore.js'

beforeEach(() => {
  resetWorkflowStore()
})

describe('workflowStore', () => {
  const sampleInput = {
    title: 'Test Workflow',
    description: 'A test workflow',
    phases: [
      { name: 'Planning', description: 'Plan the work' },
      { name: 'Execution', description: 'Execute the plan' },
    ],
    steps: [
      { name: 'Research', description: 'Do research', phase: 1 },
      { name: 'Design', description: 'Create design', phase: 1 },
      { name: 'Implement', description: 'Write code', phase: 2 },
    ],
  }

  test('creates a workflow with active status', () => {
    const wf = createWorkflow(sampleInput)
    expect(wf.id).toMatch(/^wf_\d+_/)
    expect(wf.title).toBe('Test Workflow')
    expect(wf.status).toBe('active')
    expect(wf.phases.length).toBe(2)
    expect(wf.steps.length).toBe(3)
  })

  test('creates workflow with ordered phases', () => {
    const wf = createWorkflow(sampleInput)
    expect(wf.phases[0].order).toBe(1)
    expect(wf.phases[0].name).toBe('Planning')
    expect(wf.phases[1].order).toBe(2)
    expect(wf.phases[1].name).toBe('Execution')
  })

  test('creates workflow with pending steps', () => {
    const wf = createWorkflow(sampleInput)
    for (const step of wf.steps) {
      expect(step.status).toBe('pending')
    }
  })

  test('creates unique workflow IDs', () => {
    const wf1 = createWorkflow(sampleInput)
    const wf2 = createWorkflow(sampleInput)
    expect(wf1.id).not.toBe(wf2.id)
  })

  test('getWorkflow returns workflow by id', () => {
    const wf = createWorkflow(sampleInput)
    const found = getWorkflow(wf.id)
    expect(found).toBeDefined()
    expect(found!.title).toBe('Test Workflow')
  })

  test('getWorkflow returns undefined for unknown id', () => {
    expect(getWorkflow('unknown')).toBeUndefined()
  })

  test('updateWorkflowStatus changes workflow status', () => {
    const wf = createWorkflow(sampleInput)
    const updated = updateWorkflowStatus(wf.id, 'completed')
    expect(updated).toBeDefined()
    expect(updated!.status).toBe('completed')
  })

  test('updateWorkflowStatus returns undefined for unknown id', () => {
    expect(updateWorkflowStatus('unknown', 'completed')).toBeUndefined()
  })

  test('updateStep updates step status and sets timestamps', () => {
    const wf = createWorkflow(sampleInput)
    const stepId = wf.steps[0].id

    const updated = updateStep(wf.id, stepId, { id: stepId, status: 'in_progress' })
    expect(updated).toBeDefined()
    expect(updated!.status).toBe('in_progress')
    expect(updated!.startedAt).toBeDefined()

    const completed = updateStep(wf.id, stepId, { id: stepId, status: 'completed' })
    expect(completed!.status).toBe('completed')
    expect(completed!.completedAt).toBeDefined()
  })

  test('updateStep returns undefined for unknown step', () => {
    const wf = createWorkflow(sampleInput)
    expect(updateStep(wf.id, 'unknown', { id: 'unknown', status: 'completed' })).toBeUndefined()
  })

  test('updateStep returns undefined for unknown workflow', () => {
    expect(updateStep('unknown', 'step1', { id: 'step1', status: 'completed' })).toBeUndefined()
  })

  test('auto-completes workflow when all steps done', () => {
    const wf = createWorkflow(sampleInput)
    for (const step of wf.steps) {
      updateStep(wf.id, step.id, { id: step.id, status: 'completed' })
    }
    const completed = getWorkflow(wf.id)
    expect(completed!.status).toBe('completed')
  })

  test('listWorkflows returns sorted by updatedAt descending', () => {
    const wf1 = createWorkflow(sampleInput)
    const wf2 = createWorkflow({ ...sampleInput, title: 'Second' })
    const list = listWorkflows()
    expect(list.length).toBe(2)
    expect(list[0].title).toBe('Second')
  })

  test('listWorkflows filters by status', () => {
    const wf = createWorkflow(sampleInput)
    updateWorkflowStatus(wf.id, 'completed')

    const active = listWorkflows({ status: 'active' })
    expect(active.length).toBe(0)

    const completed = listWorkflows({ status: 'completed' })
    expect(completed.length).toBe(1)
  })

  test('getWorkflowSummaries returns compact view', () => {
    createWorkflow(sampleInput)
    const summaries = getWorkflowSummaries()
    expect(summaries.length).toBe(1)
    expect(summaries[0].phaseCount).toBe(2)
    expect(summaries[0].stepCount).toBe(3)
    expect(summaries[0].completedSteps).toBe(0)
  })

  test('getWorkflowProgress returns formatted report', () => {
    const wf = createWorkflow(sampleInput)
    const report = getWorkflowProgress(wf.id)
    expect(report).toContain('Test Workflow')
    expect(report).toContain('Phases')
    expect(report).toContain('Planning')
    expect(report).toContain('Execution')
  })

  test('getWorkflowProgress returns undefined for unknown id', () => {
    expect(getWorkflowProgress('unknown')).toBeUndefined()
  })

  test('resetWorkflowStore clears all workflows', () => {
    createWorkflow(sampleInput)
    expect(listWorkflows().length).toBe(1)
    resetWorkflowStore()
    expect(listWorkflows().length).toBe(0)
  })

  test('workflow has timestamp fields', () => {
    const wf = createWorkflow(sampleInput)
    expect(wf.createdAt).toBeDefined()
    expect(wf.updatedAt).toBeDefined()
  })

  test('steps support assignee field', () => {
    const inputWithAssignee = {
      ...sampleInput,
      steps: [
        { name: 'Task', description: 'A task', phase: 1, assignee: 'alice' },
      ],
    }
    const wf = createWorkflow(inputWithAssignee)
    expect(wf.steps[0].assignee).toBe('alice')
  })

  test('updateStep updates result field', () => {
    const wf = createWorkflow(sampleInput)
    const stepId = wf.steps[0].id
    updateStep(wf.id, stepId, { id: stepId, status: 'completed', result: 'Done!' })
    const found = getWorkflow(wf.id)
    expect(found!.steps[0].result).toBe('Done!')
  })
})
