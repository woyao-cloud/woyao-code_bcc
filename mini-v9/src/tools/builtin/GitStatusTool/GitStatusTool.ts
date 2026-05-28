import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { getCwd } from '../../../bootstrap/state.js'
import { getGitState, getGitStatus } from '../../../utils/git.js'
import { readGitUserConfig } from '../../../utils/gitSettings.js'

export const GitStatusTool: Tool = {
  name: 'GitStatus',
  description:
    'Show comprehensive git repository status: branch, commit, working tree cleanliness, changed files, ahead/behind tracking, and recent commits.',
  inputSchema: {
    type: 'object',
    properties: {
      verbose: {
        type: 'boolean',
        description: 'Show full details including per-file status and recent commits (default: true)',
      },
    },
    required: [],
  },
  prompt: 'GitStatus tool: show repository status and branch info.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const cwd = ctx.cwd || getCwd()
    const verbose = input.verbose !== false

    try {
      const gitState = await getGitState(cwd)
      if (!gitState) {
        return { content: 'Not in a git repository', success: false, error: 'Not a git repo' }
      }

      const gitStatus = await getGitStatus(cwd)
      const userConfig = await readGitUserConfig(cwd)

      const parts: string[] = []
      parts.push(`Branch: ${gitState.branch || '(detached)'}`)
      parts.push(`Default Branch: ${gitState.defaultBranch || 'main'}`)
      parts.push(`Commit: ${gitState.shortCommit || 'none'}`)
      parts.push(`Working Tree: ${gitState.isClean ? 'Clean' : 'Dirty'}`)

      if (gitState.remoteUrl) {
        parts.push(`Remote: ${gitState.remoteUrl}`)
      }
      if (userConfig.userName) {
        parts.push(`User: ${userConfig.userName}`)
      }
      if (gitState.ahead > 0 || gitState.behind > 0) {
        parts.push(`Ahead/Behind: +${gitState.ahead} / -${gitState.behind}`)
      }

      if (verbose && gitStatus.isGit) {
        if (gitStatus.hasStagedChanges) {
          parts.push('\nStaged changes:')
          const staged = await (await import('../../../utils/git.js')).getStagedFiles(cwd)
          for (const f of staged) parts.push(`  ${f}`)
        }
        if (gitStatus.hasUnstagedChanges) {
          parts.push('\nUnstaged changes:')
          const modified = await (await import('../../../utils/git.js')).getModifiedFiles(cwd)
          for (const f of modified) parts.push(`  ${f}`)
        }
        if (gitStatus.hasUntrackedFiles) {
          parts.push('\nUntracked files:')
          const untracked = await (await import('../../../utils/git.js')).getUntrackedFiles(cwd)
          for (const f of untracked.slice(0, 20)) parts.push(`  ${f}`)
          if (untracked.length > 20) parts.push(`  ... and ${untracked.length - 20} more`)
        }
      }

      return { content: parts.join('\n'), success: true }
    } catch (e) {
      return { content: `Git status error: ${e}`, success: false, error: String(e) }
    }
  },
  userFacingName: () => 'GitStatus',
}
