import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { createCronJob } from '../../../services/cron/scheduler.js'

export const CronCreateTool: Tool = {
  name: 'CronCreate',
  description:
    'Create a scheduled cron job. Jobs are persisted and will run at the specified interval. Use with CronList to view and CronDelete to remove.',
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description:
          'Cron expression or interval (e.g. "0 */6 * * *" for every 6 hours, "hourly", "daily")',
      },
      command: {
        type: 'string',
        description: 'Command or task description to run',
      },
      description: {
        type: 'string',
        description: 'Human-readable description of this job',
      },
    },
    required: ['expression', 'command'],
  },
  prompt:
    'CronCreate tool: schedule a recurring task. Use "hourly", "daily", "weekly", or cron expressions like "0 */6 * * *".',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const expression = String(input.expression ?? '').trim()
    const command = String(input.command ?? '').trim()
    const description = input.description
      ? String(input.description).trim()
      : ''

    if (!expression) {
      return {
        content: 'Cron expression is required',
        success: false,
        error: 'Missing expression',
      }
    }
    if (!command) {
      return {
        content: 'Command is required',
        success: false,
        error: 'Missing command',
      }
    }

    const job = createCronJob({ expression, command, description })
    return {
      content: [
        `Cron job created:`,
        `  ID: ${job.id}`,
        `  Expression: ${expression}`,
        `  Command: ${command}`,
        description ? `  Description: ${description}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      success: true,
      metadata: { cronJobId: job.id },
    }
  },

  userFacingName: () => 'CronCreate',
}
