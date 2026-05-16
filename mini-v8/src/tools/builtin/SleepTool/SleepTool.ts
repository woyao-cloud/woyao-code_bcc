import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'

export const SleepTool: Tool = {
  name: 'Sleep',
  description:
    'Pause execution for a specified duration in milliseconds. Use for timing, waiting, or rate limiting.',
  inputSchema: {
    type: 'object',
    properties: {
      ms: { type: 'number', description: 'Duration to sleep in milliseconds' },
    },
    required: ['ms'],
  },
  prompt: 'Sleep tool: pause execution for a specified duration.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const ms = Number(input.ms ?? 0)
    if (!Number.isFinite(ms) || ms < 0) {
      return {
        content: 'Invalid duration. Must be a non-negative number.',
        success: false,
        error: 'Invalid ms',
      }
    }
    if (ms > 300_000) {
      return {
        content: `Duration too long: ${ms}ms (max 300000ms = 5 minutes).`,
        success: false,
        error: 'Exceeds max',
      }
    }

    await new Promise(resolve => setTimeout(resolve, ms))
    return { content: `Slept for ${ms}ms.`, success: true }
  },

  userFacingName: () => 'Sleep',
}
