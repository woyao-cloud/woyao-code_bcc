import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { getTask } from '../../../services/taskStore.js'

export const TaskGetTool: Tool = {
  name: 'TaskGet',
  description:
    'Get details of a specific task by ID. Returns the task title, description, status, and result if available.',
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
  prompt: 'TaskGet tool: get details of a specific task.',
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
      `Created: ${task.createdAt}`,
      `Updated: ${task.updatedAt}`,
    ]
    if (task.result) {
      lines.push(`Result: ${task.result.slice(0, 500)}`)
    }

    return { content: lines.join('\n'), success: true }
  },

  userFacingName: () => 'TaskGet',
}
