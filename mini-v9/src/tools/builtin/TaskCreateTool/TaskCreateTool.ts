import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { createTask } from '../../../services/taskStore.js'

export const TaskCreateTool: Tool = {
  name: 'TaskCreate',
  description:
    'Create a new task to track sub-work. Tasks help organize complex multi-step work. ' +
    'Use for breaking down large tasks into manageable sub-tasks. ' +
    'Tasks can have dependencies: use blockedBy to declare prerequisites, ' +
    'and blocks to declare what depends on this task.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short title for the task' },
      description: {
        type: 'string',
        description: 'Detailed description of what needs to be done',
      },
      owner: {
        type: 'string',
        description: 'Optional owner/assignee for this task',
      },
      blockedBy: {
        type: 'array',
        items: { type: 'string' },
        description: 'Task IDs that must complete before this task can start',
      },
      blocks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Task IDs that depend on this task (this task blocks them)',
      },
    },
    required: ['title', 'description'],
  },
  prompt:
    'TaskCreate tool: create sub-tasks to track work. ' +
    'Use blockedBy to declare task dependencies and blocks to declare what depends on this task.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,

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

    const rawBlockedBy = input.blockedBy
    const blockedBy: string[] = Array.isArray(rawBlockedBy)
      ? rawBlockedBy.map(String)
      : []

    const rawBlocks = input.blocks
    const blocks: string[] = Array.isArray(rawBlocks)
      ? rawBlocks.map(String)
      : []

    const owner = input.owner ? String(input.owner).trim() : undefined

    const task = createTask(title, description, {
      owner,
      blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      blocks: blocks.length > 0 ? blocks : undefined,
    })

    const parts: string[] = [
      `Task created: ${task.id} - "${task.title}"`,
      `Status: ${task.status}`,
      `Description: ${task.description}`,
    ]
    if (task.owner) parts.push(`Owner: ${task.owner}`)
    if (task.blockedBy.length > 0) {
      parts.push(`Blocked by: ${task.blockedBy.join(', ')}`)
    }
    if (task.blocks.length > 0) {
      parts.push(`Blocks: ${task.blocks.join(', ')}`)
    }

    return {
      content: parts.join('\n'),
      success: true,
      metadata: { taskId: task.id },
    }
  },

  userFacingName: () => 'TaskCreate',
}
