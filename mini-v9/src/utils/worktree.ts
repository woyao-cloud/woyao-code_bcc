/**
 * Git worktree utilities for mini-v9.
 * Used by forkSubagent to create isolated working trees for safe agent execution.
 */

import { execFileNoThrow } from './execFileNoThrow.js'
import { getGitRoot } from './git.js'

export interface WorktreeOptions {
  branch: string
  path: string
  autoRemove?: boolean
}

/**
 * Create a new git worktree at the given path on the given branch.
 * Returns the path of the created worktree, or null on failure.
 */
export async function createWorktree(
  cwd: string,
  options: WorktreeOptions,
): Promise<string | null> {
  const { branch, path } = options
  const root = await getGitRoot(cwd)
  if (!root) return null

  const result = await execFileNoThrow(
    'git',
    ['worktree', 'add', '--detach', path, 'HEAD', '--quiet'],
    { cwd: root },
  )
  if (result.exitCode !== 0) {
    return null
  }

  // Checkout the branch
  await execFileNoThrow('git', ['checkout', '-b', branch], { cwd: path })

  return path
}

/**
 * Remove a git worktree.
 */
export async function removeWorktree(
  cwd: string,
  worktreePath: string,
  force = false,
): Promise<boolean> {
  const args = ['worktree', 'remove']
  if (force) args.push('--force')
  args.push(worktreePath)

  const result = await execFileNoThrow('git', args, { cwd })
  return result.exitCode === 0
}

/**
 * List all worktrees in the repository.
 */
export async function listWorktrees(
  cwd: string,
): Promise<Array<{ path: string; branch: string; detached: boolean }>> {
  const root = await getGitRoot(cwd)
  if (!root) return []

  const result = await execFileNoThrow('git', ['worktree', 'list', '--porcelain'], { cwd: root })
  if (result.exitCode !== 0) return []

  const entries: Array<{ path: string; branch: string; detached: boolean }> = []
  const lines = result.stdout.trim().split('\n')

  let currentPath = ''
  let currentBranch = ''
  let detached = false

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (currentPath) {
        entries.push({ path: currentPath, branch: currentBranch, detached })
      }
      currentPath = line.slice(9).trim()
      currentBranch = ''
      detached = false
    } else if (line.startsWith('branch ')) {
      const ref = line.slice(7).trim()
      currentBranch = ref.replace('refs/heads/', '')
    } else if (line.startsWith('detached')) {
      detached = true
    }
  }

  if (currentPath) {
    entries.push({ path: currentPath, branch: currentBranch, detached })
  }

  return entries
}
