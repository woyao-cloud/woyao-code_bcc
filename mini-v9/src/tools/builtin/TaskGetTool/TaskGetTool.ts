import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import {
  getTask,
  getTasksBlocking,
  getTaskBlockedBy,
} from '../../../services/taskStore.js'

export const TaskGetTool: Tool = {
  name: 'TaskGet',
  description:
    'Get details of a specific task by ID. Returns full task info including title, description, status, owner, dependencies (blocks/blockedBy), and result.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The task ID to retrieve (e.g. task_1)',
      },
    },
    required: ['id'],
  },
  prompt: 'TaskGet tool: get full details of a specific task.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
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

    const task = getTask(id)
    if (!task) {
      return {
        content: `Task not found: ${id}`,
        success: false,
        error: 'Not found',
      }
    }

    const lines: string[] = [
      `ID: ${task.id}`,
      `Title: ${task.title}`,
      `Status: ${task.status}`,
      `Description: ${task.description}`,
    ]
    if (task.owner) lines.push(`Owner: ${task.owner}`)
    if (task.blockedBy.length > 0) {
      const blockers = getTaskBlockedBy(id)
      lines.push(
        `Blocked by: ${task.blockedBy.join(', ')}` +
          (blockers.length > 0
            ? blockers.map(t => `\n  - ${t.id}: "${t.title}" [${t.status}]`)
            : ''),
      )
    }
    if (task.blocks.length > 0) {
      const blocking = getTasksBlocking(id)
      lines.push(
        `Blocks: ${task.blocks.join(', ')}` +
          (blocking.length > 0
            ? blocking.map(t => `\n  - ${t.id}: "${t.title}" [${t.status}]`)
            : ''),
      )
    }
    lines.push(`Created: ${task.createdAt}`)
    lines.push(`Updated: ${task.updatedAt}`)
    if (task.result) {
      lines.push(`Result: ${task.result.slice(0, 500)}`)
    }

    return { content: lines.join('\n'), success: true }
  },

  userFacingName: () => 'TaskGet',
}
