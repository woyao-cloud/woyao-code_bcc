import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { getCwd } from '../../../bootstrap/state.js'
import {
  fetchGitDiff,
  fetchGitDiffHunks,
  fetchSingleFileGitDiff,
} from '../../../utils/gitDiff.js'
import { getIsGit } from '../../../utils/git.js'

export const GitDiffTool: Tool = {
  name: 'GitDiff',
  description:
    'Show git diff stats and hunks for the working tree vs HEAD. Returns file count, lines added/removed, and per-file hunks. Use with file=path to get a PR-like diff for a single file.',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Optional: show diff for a specific file only',
      },
      mode: {
        type: 'string',
        description: 'Optional: "stats" for summary only, "hunks" for full patch details (default: "stats")',
        enum: ['stats', 'hunks'],
      },
    },
    required: [],
  },
  prompt: 'GitDiff tool: show working tree diff stats or hunks.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const cwd = ctx.cwd || getCwd()
    const file = input.file ? String(input.file) : undefined
    const mode = String(input.mode || 'stats') as 'stats' | 'hunks'

    const isGit = await getIsGit(cwd)
    if (!isGit) {
      return { content: 'Not in a git repository', success: false, error: 'Not a git repo' }
    }

    try {
      if (file) {
        const result = await fetchSingleFileGitDiff(cwd, file)
        if (!result) {
          return { content: `No diff found for ${file}`, success: false, error: 'No diff' }
        }
        return {
          content: `File: ${result.filename} (${result.status})\n+${result.additions} -${result.deletions}\n\n${result.patch}`,
          success: true,
        }
      }

      const diffResult = await fetchGitDiff(cwd)
      if (!diffResult) {
        return { content: 'No diff available', success: false, error: 'No diff' }
      }

      const { stats, perFileStats } = diffResult
      let output = `Files changed: ${stats.filesCount}\nLines added: ${stats.linesAdded}\nLines removed: ${stats.linesRemoved}\n`

      if (perFileStats.size > 0) {
        output += '\nPer-file stats:\n'
        for (const [filePath, fileStats] of perFileStats) {
          const tag = fileStats.isUntracked ? ' [untracked]' : ''
          output += `  ${filePath}: +${fileStats.added} -${fileStats.removed}${fileStats.isBinary ? ' (binary)' : ''}${tag}\n`
        }
      }

      if (mode === 'hunks') {
        const hunks = await fetchGitDiffHunks(cwd)
        if (hunks.size > 0) {
          output += '\nHunks:\n'
          for (const [filePath, fileHunks] of hunks) {
            output += `\n--- ${filePath} ---\n`
            for (const hunk of fileHunks) {
              output += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`
              output += hunk.lines.slice(0, 50).join('\n') + '\n'
              if (hunk.lines.length > 50) output += '  ... (truncated)\n'
            }
          }
        }
      }

      return { content: output, success: true }
    } catch (e) {
      return { content: `Git diff error: ${e}`, success: false, error: String(e) }
    }
  },
  userFacingName: () => 'GitDiff',
}
