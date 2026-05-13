import { execFileNoThrow } from './execFileNoThrow.js'

/**
 * Get git executable path
 */
export function gitExe(): string {
  return 'git'
}

/**
 * Check if the current directory is a git repository
 */
export async function getIsGit(cwd: string): Promise<boolean> {
  const result = await execFileNoThrow('git', ['rev-parse', '--git-dir'], {
    cwd,
  })
  return result.exitCode === 0 && result.stdout.trim().length > 0
}

/**
 * Get the current git branch
 */
export async function getBranch(cwd: string): Promise<string | null> {
  const result = await execFileNoThrow(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd },
  )
  if (result.exitCode === 0) {
    return result.stdout.trim() || null
  }
  return null
}

/**
 * Get the default branch name
 */
export async function getDefaultBranch(cwd: string): Promise<string> {
  const result = await execFileNoThrow(
    'git',
    ['symbolic-ref', 'refs/remotes/origin/HEAD'],
    { cwd },
  )
  if (result.exitCode === 0) {
    const ref = result.stdout.trim()
    return ref.replace('refs/remotes/origin/', '')
  }
  return 'main'
}
