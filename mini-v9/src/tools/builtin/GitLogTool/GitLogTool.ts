import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import { getCwd } from '../../../bootstrap/state.js'
import { getIsGit } from '../../../utils/git.js'

export const GitLogTool: Tool = {
  name: 'GitLog',
  description:
    'Show git log with configurable depth, format, and filters. Default shows last 10 commits in oneline format.',
  inputSchema: {
    type: 'object',
    properties: {
      maxCount: {
        type: 'number',
        description: 'Number of commits to show (default: 10)',
      },
      path: {
        type: 'string',
        description: 'Show commits that touch this file path',
      },
      author: {
        type: 'string',
        description: 'Filter by author (partial match)',
      },
      format: {
        type: 'string',
        description:
          'Output format: "oneline", "short", "medium", "full" (default: "oneline")',
        enum: ['oneline', 'short', 'medium', 'full'],
      },
      branch: {
        type: 'string',
        description: 'Branch to show log for (default: current branch)',
      },
    },
    required: [],
  },
  prompt: 'GitLog tool: view commit history.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const cwd = ctx.cwd || getCwd()

    const isGit = await getIsGit(cwd)
    if (!isGit) {
      return {
        content: 'Not in a git repository',
        success: false,
        error: 'Not a git repo',
      }
    }

    const maxCount = Number(input.maxCount) || 10
    const path = input.path ? String(input.path) : undefined
    const author = input.author ? String(input.author) : undefined
    const format = String(input.format || 'oneline')
    const branch = input.branch ? String(input.branch) : undefined

    try {
      const args: string[] = ['log']

      if (branch) args.push(branch)

      if (format === 'oneline') {
        args.push('--oneline')
      } else if (format === 'short') {
        args.push('--format=short')
      } else if (format === 'medium') {
        args.push('--format=medium')
      } else if (format === 'full') {
        args.push('--format=fuller')
      }

      args.push(`-${Math.max(1, Math.min(maxCount, 100))}`)

      if (author) {
        args.push(`--author=${author}`)
      }
      if (path) {
        args.push('--', path)
      }

      const result = await execFileNoThrow('git', args, { cwd })

      if (result.exitCode !== 0) {
        return {
          content: `Git log failed:\n${result.stderr}`,
          success: false,
          error: result.stderr,
        }
      }

      const output = result.stdout.trim() || '(no commits)'
      return { content: output, success: true }
    } catch (e) {
      return {
        content: `Git log error: ${e}`,
        success: false,
        error: String(e),
      }
    }
  },
  userFacingName: () => 'GitLog',
}
