import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { deleteCronJob } from '../../../services/cron/scheduler.js'

export const CronDeleteTool: Tool = {
  name: 'CronDelete',
  description:
    'Delete a scheduled cron job by ID. Use CronList to find job IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The cron job ID to delete' },
    },
    required: ['id'],
  },
  prompt: 'CronDelete tool: remove a scheduled cron job by its ID.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const id = String(input.id ?? '').trim()
    if (!id) {
      return {
        content: 'Cron job ID is required',
        success: false,
        error: 'Missing id',
      }
    }

    const ok = deleteCronJob(id)
    return ok
      ? { content: `Cron job ${id} deleted.`, success: true }
      : {
          content: `Cron job not found: ${id}`,
          success: false,
          error: 'Not found',
        }
  },

  userFacingName: () => 'CronDelete',
}
