import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { listTasks } from '../../../services/taskStore.js'

export const TaskListTool: Tool = {
  name: 'TaskList',
  description:
    'List all tasks and their current status. Use to review progress and see what remains.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  prompt: 'TaskList tool: list all tracked tasks.',

  async execute(
    _ctx: ToolUseContext,
    _input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tasks = listTasks()

    if (tasks.length === 0) {
      return { content: 'No tasks created yet.', success: true }
    }

    const statusIcon: Record<string, string> = {
      pending: '',
      in_progress: '',
      completed: '',
      failed: '',
    }

    const lines = tasks.map(t => {
      const icon = statusIcon[t.status] || '?'
      return `${icon} [${t.status}] ${t.id}: ${t.title}`
    })

    return {
      content: `${tasks.length} tasks:\n${lines.join('\n')}`,
      success: true,
    }
  },

  userFacingName: () => 'TaskList',
}
