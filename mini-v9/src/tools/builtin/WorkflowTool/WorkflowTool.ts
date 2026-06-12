import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import {
  createWorkflow,
  getWorkflow,
  updateWorkflowStatus,
  updateStep,
  listWorkflows,
  getWorkflowSummaries,
  getWorkflowProgress,
} from '../../../services/workflowStore.js'

export const WorkflowTool: Tool = {
  name: 'Workflow',
  description:
    'Manage structured multi-phase workflows with step-by-step tracking. ' +
    'Actions: create — define a workflow with phases and steps; ' +
    'update — update a step status (in_progress/completed/failed/skipped) and result; ' +
    'update_status — change workflow-level status (active/completed/cancelled); ' +
    'list — list all workflows with optional status filter; ' +
    'get — view full workflow details and step status; ' +
    'progress — get a formatted progress report with phase completion breakdown.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'update', 'update_status', 'list', 'get', 'progress'],
        description: 'The workflow action to perform',
      },
      id: {
        type: 'string',
        description:
          'Workflow ID (required for update, get, progress, update_status)',
      },
      title: {
        type: 'string',
        description: 'Workflow title (required for create)',
      },
      description: {
        type: 'string',
        description: 'Workflow description (required for create)',
      },
      phases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Phase name' },
            description: { type: 'string', description: 'Phase description' },
          },
          required: ['name'],
        },
        description: 'List of phases for the workflow (required for create)',
      },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Step name' },
            description: { type: 'string', description: 'Step description' },
            phase: {
              type: 'number',
              description: 'Phase number (1-based index)',
            },
            assignee: { type: 'string', description: 'Optional assignee' },
          },
          required: ['name', 'description', 'phase'],
        },
        description: 'List of steps for the workflow (required for create)',
      },
      stepId: {
        type: 'string',
        description: 'Step ID to update (required for update action)',
      },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'failed', 'skipped'],
        description:
          'New step status (for update) or workflow status (for update_status)',
      },
      result: {
        type: 'string',
        description: 'Result or output from the step (for update)',
      },
      assignee: {
        type: 'string',
        description: 'Set or change step assignee (for update)',
      },
      filter_status: {
        type: 'string',
        enum: ['active', 'completed', 'cancelled'],
        description: 'Filter workflows by status (for list)',
      },
    },
    required: ['action'],
  },
  prompt:
    'Workflow tool: manage structured multi-phase workflows. ' +
    'Use "create" to define a new workflow with phases and steps. ' +
    'Use "update" to track step progress (status, result). ' +
    'Use "progress" to get a formatted status report. ' +
    'Steps automatically set startedAt on in_progress and completedAt on completed/failed.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const action = String(input.action ?? '').trim()

    switch (action) {
      case 'create': {
        const title = String(input.title ?? '').trim()
        const description = String(input.description ?? '').trim()

        if (!title) {
          return {
            content: 'Workflow title is required',
            success: false,
            error: 'Missing title',
          }
        }
        if (!description) {
          return {
            content: 'Workflow description is required',
            success: false,
            error: 'Missing description',
          }
        }

        const rawPhases = input.phases
        if (!Array.isArray(rawPhases) || rawPhases.length === 0) {
          return {
            content: 'At least one phase is required',
            success: false,
            error: 'Missing phases',
          }
        }
        const phases = rawPhases.map(p => {
          const phase = p as Record<string, unknown>
          return {
            name: String(phase.name ?? '').trim(),
            description: String(phase.description ?? '').trim(),
          }
        })

        const rawSteps = input.steps
        if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
          return {
            content: 'At least one step is required',
            success: false,
            error: 'Missing steps',
          }
        }
        const steps = rawSteps.map(s => {
          const step = s as Record<string, unknown>
          return {
            name: String(step.name ?? '').trim(),
            description: String(step.description ?? '').trim(),
            phase: Number(step.phase ?? 1),
            assignee: step.assignee ? String(step.assignee).trim() : undefined,
          }
        })

        const workflow = createWorkflow({
          title,
          description,
          phases,
          steps,
        })

        const parts: string[] = [
          `Workflow created: ${workflow.id}`,
          `Title: ${workflow.title}`,
          `Status: ${workflow.status}`,
          `Phases: ${workflow.phases.length}`,
          `Steps: ${workflow.steps.length}`,
          '',
          '### Phases',
        ]

        for (const phase of workflow.phases) {
          const phaseSteps = workflow.steps.filter(s => s.phase === phase.order)
          parts.push(
            `Phase ${phase.order}: ${phase.name} (${phaseSteps.length} steps)`,
          )
          if (phase.description) {
            parts.push(`  ${phase.description}`)
          }
        }

        parts.push(
          '',
          `Use Workflow progress id:${workflow.id} to track progress.`,
        )

        return {
          content: parts.join('\n'),
          success: true,
          metadata: { workflowId: workflow.id },
        }
      }

      case 'update': {
        const id = String(input.id ?? '').trim()
        const stepId = String(input.stepId ?? '').trim()

        if (!id) {
          return {
            content: 'Workflow ID is required',
            success: false,
            error: 'Missing workflow ID',
          }
        }
        if (!stepId) {
          return {
            content: 'Step ID is required',
            success: false,
            error: 'Missing stepId',
          }
        }

        const status = input.status ? String(input.status).trim() : undefined
        const result = input.result ? String(input.result) : undefined
        const assignee = input.assignee
          ? String(input.assignee).trim()
          : undefined

        const updatedStep = updateStep(id, stepId, {
          id: stepId,
          status: status as
            | 'pending'
            | 'in_progress'
            | 'completed'
            | 'failed'
            | 'skipped'
            | undefined,
          result,
          assignee,
        })

        if (!updatedStep) {
          return {
            content: `Step ${stepId} not found in workflow ${id}`,
            success: false,
            error: 'Step not found',
          }
        }

        const parts: string[] = [
          `Step updated: ${updatedStep.name}`,
          `  Status: ${updatedStep.status}`,
        ]
        if (updatedStep.result) {
          parts.push(`  Result: ${updatedStep.result.slice(0, 200)}`)
        }
        if (updatedStep.assignee) {
          parts.push(`  Assignee: ${updatedStep.assignee}`)
        }

        // Check if workflow auto-completed
        const workflow = getWorkflow(id)
        if (workflow && workflow.status === 'completed') {
          parts.push('', 'All steps completed — workflow is now complete!')
        }

        return {
          content: parts.join('\n'),
          success: true,
        }
      }

      case 'update_status': {
        const id = String(input.id ?? '').trim()
        const status = String(input.status ?? '').trim()

        if (!id) {
          return {
            content: 'Workflow ID is required',
            success: false,
            error: 'Missing workflow ID',
          }
        }
        if (!['active', 'completed', 'cancelled'].includes(status)) {
          return {
            content: `Invalid workflow status: "${status}". Must be one of: active, completed, cancelled`,
            success: false,
            error: 'Invalid status',
          }
        }

        const updated = updateWorkflowStatus(
          id,
          status as 'active' | 'completed' | 'cancelled',
        )
        if (!updated) {
          return {
            content: `Workflow not found: ${id}`,
            success: false,
            error: 'Workflow not found',
          }
        }

        return {
          content: `Workflow ${id} status updated to: ${status}`,
          success: true,
        }
      }

      case 'list': {
        const filterStatus = input.filter_status
          ? (String(input.filter_status).trim() as
              | 'active'
              | 'completed'
              | 'cancelled')
          : undefined

        const summaries = getWorkflowSummaries(
          filterStatus ? { status: filterStatus } : undefined,
        )

        if (summaries.length === 0) {
          return {
            content: 'No workflows found.',
            success: true,
          }
        }

        const parts: string[] = [`Workflows (${summaries.length})`, '']

        for (const s of summaries) {
          parts.push(
            `  ${s.id} — ${s.title}` +
              ` | ${s.status}` +
              ` | ${s.completedSteps}/${s.stepCount} steps` +
              ` | ${s.phaseCount} phases`,
          )
        }

        return {
          content: parts.join('\n'),
          success: true,
        }
      }

      case 'get': {
        const id = String(input.id ?? '').trim()
        if (!id) {
          return {
            content: 'Workflow ID is required',
            success: false,
            error: 'Missing workflow ID',
          }
        }

        const workflow = getWorkflow(id)
        if (!workflow) {
          return {
            content: `Workflow not found: ${id}`,
            success: false,
            error: 'Workflow not found',
          }
        }

        const parts: string[] = [
          `Workflow: ${workflow.title} (${workflow.id})`,
          `Status: ${workflow.status}`,
          `Description: ${workflow.description}`,
          `Created: ${workflow.createdAt}`,
          `Updated: ${workflow.updatedAt}`,
          '',
          '### Phases & Steps',
        ]

        for (const phase of workflow.phases) {
          const phaseSteps = workflow.steps.filter(s => s.phase === phase.order)
          const phaseCompleted = phaseSteps.filter(
            s => s.status === 'completed',
          ).length
          parts.push(
            `Phase ${phase.order}: ${phase.name} (${phaseCompleted}/${phaseSteps.length})`,
          )

          for (const step of phaseSteps) {
            const icon =
              step.status === 'completed'
                ? '[✓]'
                : step.status === 'in_progress'
                  ? '[→]'
                  : step.status === 'failed'
                    ? '[✗]'
                    : step.status === 'skipped'
                      ? '[-]'
                      : '[ ]'
            parts.push(`  ${icon} ${step.name} (${step.id.slice(0, 12)}...)`)
            if (step.assignee) parts.push(`    Assignee: ${step.assignee}`)
            if (step.result)
              parts.push(`    Result: ${step.result.slice(0, 200)}`)
          }
        }

        return {
          content: parts.join('\n'),
          success: true,
        }
      }

      case 'progress': {
        const id = String(input.id ?? '').trim()
        if (!id) {
          return {
            content: 'Workflow ID is required',
            success: false,
            error: 'Missing workflow ID',
          }
        }

        const report = getWorkflowProgress(id)
        if (!report) {
          return {
            content: `Workflow not found: ${id}`,
            success: false,
            error: 'Workflow not found',
          }
        }

        return {
          content: report,
          success: true,
        }
      }

      default:
        return {
          content: `Unknown action: "${action}". Must be one of: create, update, update_status, list, get, progress`,
          success: false,
          error: 'Unknown action',
        }
    }
  },

  userFacingName: () => 'Workflow',
}
