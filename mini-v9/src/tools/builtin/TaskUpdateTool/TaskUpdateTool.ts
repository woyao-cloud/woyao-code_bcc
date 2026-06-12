import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import {
  updateTask,
  getTask,
  recordTaskCompletion,
  checkVerificationNudge,
} from '../../../services/taskStore.js'

export const TaskUpdateTool: Tool = {
  name: 'TaskUpdate',
  description:
    'Update the status of an existing task. Mark tasks as in_progress, completed, or failed. ' +
    'Use this to track progress through multi-step work. ' +
    'You can also manage dependencies with addBlocks/addBlockedBy parameters.',
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
      owner: {
        type: 'string',
        description: 'Set or change the task owner/assignee',
      },
      addBlocks: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Task IDs that this task now blocks (adds to existing blocks list)',
      },
      addBlockedBy: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Task IDs that now block this task (adds to existing blockedBy list)',
      },
    },
    required: ['id'],
  },
  prompt:
    'TaskUpdate tool: update task status and results. ' +
    'When completing a task, optionally provide a result summary. ' +
    'Use addBlocks/addBlockedBy to manage task dependency chains.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const id = String(input.id ?? '').trim()

    if (!id) {
      return {
        content: 'Task ID is required',
        success: false,
        error: 'Missing ID',
      }
    }

    const updates: Partial<{
      status: 'pending' | 'in_progress' | 'completed' | 'failed'
      result: string
      owner: string
      blocks: string[]
      blockedBy: string[]
    }> = {}

    if (input.status !== undefined) {
      const status = String(input.status).trim()
      const validStatuses = ['pending', 'in_progress', 'completed', 'failed']
      if (!validStatuses.includes(status)) {
        return {
          content: `Invalid status: "${status}". Must be one of: ${validStatuses.join(', ')}`,
          success: false,
          error: 'Invalid status',
        }
      }
      updates.status = status as
        | 'pending'
        | 'in_progress'
        | 'completed'
        | 'failed'
    }

    if (input.result !== undefined) {
      updates.result = String(input.result)
    }

    if (input.owner !== undefined) {
      updates.owner = String(input.owner).trim()
    }

    // Handle dependency additions (append to existing lists)
    const existingTask = getTask(id)
    if (existingTask) {
      if (input.addBlocks !== undefined && Array.isArray(input.addBlocks)) {
        const newBlocks = (input.addBlocks as string[]).map(String)
        updates.blocks = [...new Set([...existingTask.blocks, ...newBlocks])]
      }
      if (
        input.addBlockedBy !== undefined &&
        Array.isArray(input.addBlockedBy)
      ) {
        const newBlockedBy = (input.addBlockedBy as string[]).map(String)
        updates.blockedBy = [
          ...new Set([...existingTask.blockedBy, ...newBlockedBy]),
        ]
      }
    }

    const task = updateTask(id, updates)
    if (!task) {
      return {
        content: `Task not found: ${id}`,
        success: false,
        error: 'Task not found',
      }
    }

    // Track completion for verification nudge
    if (updates.status) {
      recordTaskCompletion(updates.status)
    }

    const parts: string[] = [
      `Task ${task.id} updated:`,
      `  Status: "${task.status}"`,
    ]
    if (task.owner) parts.push(`  Owner: ${task.owner}`)
    if (task.blockedBy.length > 0) {
      parts.push(`  Blocked by: ${task.blockedBy.join(', ')}`)
    }
    if (task.blocks.length > 0) {
      parts.push(`  Blocks: ${task.blocks.join(', ')}`)
    }
    if (task.result) {
      parts.push(`  Result: ${task.result.slice(0, 200)}`)
    }

    // Append verification nudge if threshold reached
    const nudge = checkVerificationNudge()
    if (nudge) {
      parts.push('')
      parts.push(nudge)
    }

    return {
      content: parts.join('\n'),
      success: true,
    }
  },

  userFacingName: () => 'TaskUpdate',
}
