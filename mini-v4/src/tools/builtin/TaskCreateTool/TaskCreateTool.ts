import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { createTask } from '../../../services/taskStore.js'

export const TaskCreateTool: Tool = {
  name: 'TaskCreate',
  description:
    'Create a new task to track sub-work. Tasks help organize complex multi-step work. ' +
    'Use for breaking down large tasks into manageable sub-tasks.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short title for the task' },
      description: {
        type: 'string',
        description: 'Detailed description of what needs to be done',
      },
    },
    required: ['title', 'description'],
  },
  prompt: 'TaskCreate tool: create sub-tasks to track work.',

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const title = String(input.title ?? '').trim()
    const description = String(input.description ?? '').trim()

    if (!title) {
      return {
        content: 'Task title is required',
        success: false,
        error: 'Missing title',
      }
    }
    if (!description) {
      return {
        content: 'Task description is required',
        success: false,
        error: 'Missing description',
      }
    }

    const task = createTask(title, description)
    return {
      content: `Task created: ${task.id} - "${task.title}"\nStatus: ${task.status}\nDescription: ${task.description}`,
      success: true,
      metadata: { taskId: task.id },
    }
  },

  userFacingName: () => 'TaskCreate',
}
