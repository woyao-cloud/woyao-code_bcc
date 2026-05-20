import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { listCronJobs } from '../../../services/cron/scheduler.js'

export const CronListTool: Tool = {
  name: 'CronList',
  description:
    'List all scheduled cron jobs with their ID, expression, command, and run count.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  prompt: 'CronList tool: list all scheduled cron jobs.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    _input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const jobs = listCronJobs()

    if (jobs.length === 0) {
      return { content: 'No cron jobs scheduled.', success: true }
    }

    const lines = [`Cron jobs (${jobs.length}):`, '']
    for (const job of jobs) {
      lines.push(`  ${job.id}`)
      lines.push(`    Expression: ${job.expression}`)
      lines.push(`    Command: ${job.command}`)
      if (job.description) lines.push(`    Description: ${job.description}`)
      lines.push(`    Runs: ${job.runCount}`)
      lines.push('')
    }

    return { content: lines.join('\n'), success: true }
  },

  userFacingName: () => 'CronList',
}
