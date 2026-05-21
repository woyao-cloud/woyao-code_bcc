import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { listTasks, getBlockedTasks } from '../../../services/taskStore.js'

export const TaskListTool: Tool = {
  name: 'TaskList',
  description:
    'List all tasks and their current status. Shows dependencies and blocked status. ' +
    'Use to review progress, identify blockers, and see what remains.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  prompt:
    'TaskList tool: list all tracked tasks with status, owner, and dependency info.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    _input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tasks = listTasks()

    if (tasks.length === 0) {
      return { content: 'No tasks created yet.', success: true }
    }

    const blockedTaskIds = new Set(getBlockedTasks().map(t => t.id))
    const lines = tasks.map(t => {
      const blocked = blockedTaskIds.has(t.id) ? ' [BLOCKED]' : ''
      const ownerInfo = t.owner ? ` (${t.owner})` : ''
      const depInfo =
        t.blockedBy.length > 0
          ? ` [waits: ${t.blockedBy.join(', ')}]`
          : ''
      return `[${t.status}] ${t.id}: ${t.title}${ownerInfo}${blocked}${depInfo}`
    })

    const parts: string[] = [
      `${tasks.length} tasks:`,
      ...lines,
    ]

    // Summary counts
    const pending = tasks.filter(t => t.status === 'pending').length
    const inProg = tasks.filter(t => t.status === 'in_progress').length
    const completed = tasks.filter(t => t.status === 'completed').length
    const failed = tasks.filter(t => t.status === 'failed').length
    const blocked = blockedTaskIds.size
    parts.push('')
    parts.push(
      `Summary: ${completed} done, ${inProg} in progress, ${pending} pending, ${failed} failed`,
    )
    if (blocked > 0) {
      parts.push(`Blocked: ${blocked} task(s) waiting on dependencies`)
    }

    return {
      content: parts.join('\n'),
      success: true,
    }
  },

  userFacingName: () => 'TaskList',
}
