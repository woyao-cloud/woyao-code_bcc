import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { agentTaskStore } from '../../../services/taskStore.js'

export const TaskOutputTool: Tool = {
  name: 'TaskOutput',
  description:
    'Get the output of a background agent task. Returns the task result content, status, and token usage.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'The task ID from async agent launch',
      },
    },
    required: ['taskId'],
  },
  prompt: 'TaskOutput tool: get output of a background agent task.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
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

    const lines: string[] = [
      `Task: ${taskId}`,
      `Agent: ${task.agentType} (${task.agentId.slice(0, 8)})`,
      `Status: ${task.status}`,
      `Prompt: ${task.prompt.slice(0, 200)}`,
      `Duration: ${task.endTime ? task.endTime - task.startTime : 'running'}ms`,
      `Tokens: ${task.progress.totalTokens}`,
      `Tool uses: ${task.progress.toolUseCount}`,
    ]

    if (task.result) {
      lines.push('')
      lines.push('--- Output ---')
      lines.push(task.result.content.join('\n\n').slice(0, 3000))
    }

    if (task.error) {
      lines.push('')
      lines.push(`Error: ${task.error}`)
    }

    return { content: lines.join('\n'), success: true }
  },

  userFacingName: () => 'TaskOutput',
}
