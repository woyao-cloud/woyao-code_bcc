import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { updateTask } from '../../../services/taskStore.js'

export const TaskUpdateTool: Tool = {
  name: 'TaskUpdate',
  description:
    'Update the status of an existing task. Mark tasks as in_progress, completed, or failed. ' +
    'Use this to track progress through multi-step work.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The task ID to update' },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'failed'],
        description: 'New status for the task',
      },
      result: {
        type: 'string',
        description: 'Optional result or output from the task',
      },
    },
    required: ['id', 'status'],
  },
  prompt: 'TaskUpdate tool: update task status and results.',

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const id = String(input.id ?? '').trim()
    const status = String(input.status ?? '').trim()
    const result = input.result ? String(input.result) : undefined

    if (!id) {
      return {
        content: 'Task ID is required',
        success: false,
        error: 'Missing ID',
      }
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'failed']
    if (!validStatuses.includes(status)) {
      return {
        content: `Invalid status: "${status}". Must be one of: ${validStatuses.join(', ')}`,
        success: false,
        error: 'Invalid status',
      }
    }

    const task = updateTask(id, {
      status: status as 'pending' | 'in_progress' | 'completed' | 'failed',
      result,
    })
    if (!task) {
      return {
        content: `Task not found: ${id}`,
        success: false,
        error: 'Task not found',
      }
    }

    return {
      content: `Task ${task.id} updated: status="${task.status}"${result ? ', result="' + result.slice(0, 200) + '"' : ''}`,
      success: true,
    }
  },

  userFacingName: () => 'TaskUpdate',
}
