import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { agentTaskStore } from '../../../services/taskStore.js'

export const TaskStopTool: Tool = {
  name: 'TaskStop',
  description:
    'Stop/kill a running background agent task. The agent will be aborted and its resources freed.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'The task ID to stop' },
    },
    required: ['taskId'],
  },
  prompt: 'TaskStop tool: stop a running background agent task.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const taskId = String(input.taskId ?? '').trim()
    if (!taskId) {
      return {
        content: 'Task ID is required',
        success: false,
        error: 'Missing taskId',
      }
    }

    const task = agentTaskStore.get(taskId)
    if (!task) {
      return {
        content: `Task not found: ${taskId}`,
        success: false,
        error: 'Not found',
      }
    }

    if (task.status !== 'running') {
      return {
        content: `Task ${taskId} is already ${task.status}. No action needed.`,
        success: true,
      }
    }

    agentTaskStore.kill(taskId)
    return {
      content: `Task ${taskId} (${task.agentType}) has been stopped.`,
      success: true,
      metadata: { taskId, agentId: task.agentId },
    }
  },

  userFacingName: () => 'TaskStop',
}
