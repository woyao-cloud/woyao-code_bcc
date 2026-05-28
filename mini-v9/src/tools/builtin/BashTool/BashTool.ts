import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { getCwd } from '../../../bootstrap/state.js'
import { isCurrentDirectoryBareGitRepo } from '../../../utils/git.js'
const DEFAULT_TIMEOUT_MS = 120_000
export const BashTool: Tool = {
  name: 'Bash',
  description:
    'Execute a shell command. Use for running scripts, installing packages, git operations, build commands.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command' },
      description: { type: 'string' },
      timeout: { type: 'number' },
    },
    required: ['command'],
  },
  prompt: 'Bash tool for executing shell commands.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => true,
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const cmd = String(input.command ?? '')
    if (!cmd.trim())
      return { content: 'No command', success: false, error: 'Empty' }

    // Bare-repo detection: prevent sandbox escape via bare git repos
    const targetCwd = ctx.cwd || getCwd()
    const isBare = await isCurrentDirectoryBareGitRepo(targetCwd)
    if (isBare) {
      return {
        content: 'Command blocked: bare git repository detected. Bare repos have no working tree and can be used for sandbox escape.',
        success: false,
        error: 'Bare git repository detected',
      }
    }

    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
    const args = process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd]
    try {
      const r = await execFileNoThrow(shell, args, {
        cwd: targetCwd,
        timeout: Number(input.timeout) || DEFAULT_TIMEOUT_MS,
      })
      return {
        content: `Exit: ${r.exitCode}\n${r.stdout}${r.stderr ? '\nStderr:\n' + r.stderr : ''}`,
        success: r.exitCode === 0,
      }
    } catch (e) {
      return { content: `Failed: ${e}`, success: false, error: String(e) }
    }
  },
  userFacingName: () => 'Bash',
}
