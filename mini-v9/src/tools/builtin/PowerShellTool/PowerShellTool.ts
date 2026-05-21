import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { getCwd } from '../../../bootstrap/state.js'

const DEFAULT_TIMEOUT_MS = 120_000

export const PowerShellTool: Tool = {
  name: 'PowerShell',
  description:
    'Execute a PowerShell command on Windows. Use for Windows-specific automation, registry access, system administration, or when Bash is unavailable.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'PowerShell command to execute' },
      description: {
        type: 'string',
        description: 'Short description of what this command does',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default 120000)',
      },
    },
    required: ['command'],
  },
  prompt:
    'PowerShell tool: execute PowerShell commands on Windows. Use for Windows system administration, registry, COM, or WMI tasks.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => true,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const command = String(input.command ?? '').trim()
    if (!command) {
      return {
        content: 'No command provided',
        success: false,
        error: 'Empty command',
      }
    }

    const timeout = Number(input.timeout ?? DEFAULT_TIMEOUT_MS)
    const cwd = ctx.cwd || getCwd()

    try {
      const result = await execFileNoThrow(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        {
          cwd,
          timeout: Math.min(timeout, 300_000),
        },
      )

      const exitCode = result.exitCode ?? 0
      const stdout = (result.stdout ?? '').trim()
      const stderr = (result.stderr ?? '').trim()

      const parts: string[] = []
      if (stdout) parts.push(stdout)
      if (stderr) parts.push(`stderr:\n${stderr}`)
      parts.push(`\n(exit code: ${exitCode})`)

      return {
        content: parts.join('\n'),
        success: exitCode === 0,
        error: exitCode !== 0 ? `Exit code ${exitCode}` : undefined,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
        return {
          content: `Command timed out after ${timeout}ms`,
          success: false,
          error: 'Timeout',
        }
      }
      return { content: `PowerShell error: ${msg}`, success: false, error: msg }
    }
  },

  userFacingName: () => 'PowerShell',
}
