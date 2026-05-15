import { execFileNoThrow } from './execFileNoThrow.js'

// ============================================================================
// Git Executable
// ============================================================================

/**
 * Get git executable path
 */
export function gitExe(): string {
  return 'git'
}

// ============================================================================
// Basic Repository Checks
// ============================================================================

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
 * Get the git root directory
 */
export async function getGitRoot(cwd: string): Promise<string | null> {
  const result = await execFileNoThrow(
    'git',
    ['rev-parse', '--show-toplevel'],
    {
      cwd,
    },
  )
  if (result.exitCode === 0) {
    return result.stdout.trim() || null
  }
  return null
}

// ============================================================================
// Branch Information
// ============================================================================

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

// ============================================================================
// Remote Repository Information
// ============================================================================

/**
 * Get the remote URL for origin
 */
export async function getRemoteUrl(cwd: string): Promise<string | null> {
  const result = await execFileNoThrow('git', ['remote', 'get-url', 'origin'], {
    cwd,
  })
  if (result.exitCode === 0) {
    return result.stdout.trim() || null
  }
  return null
}

/**
 * Normalize a git remote URL
 * - Removes .git suffix
 * - Converts to lowercase
 * - Handles both HTTPS and SSH URLs
 */
export function normalizeRemoteUrl(url: string): string {
  let normalized = url.trim().toLowerCase()

  // Remove .git suffix
  normalized = normalized.replace(/\.git$/, '')

  // Normalize SSH URLs (git@host:repo -> https://host/repo)
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/)
  if (sshMatch) {
    normalized = `https://${sshMatch[1]}/${sshMatch[2]}`
  }

  return normalized
}

/**
 * Generate a hash from a remote URL for anonymization
 */
export function hashRemoteUrl(url: string): string {
  const normalized = normalizeRemoteUrl(url)
  // Simple hash implementation using built-in crypto
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Get all remote names
 */
export async function getRemoteNames(cwd: string): Promise<string[]> {
  const result = await execFileNoThrow('git', ['remote'], { cwd })
  if (result.exitCode === 0) {
    return result.stdout.trim().split('\n').filter(Boolean)
  }
  return []
}

/**
 * Get all remote URLs
 */
export async function getRemoteUrls(
  cwd: string,
): Promise<Record<string, string>> {
  const remotes = await getRemoteNames(cwd)
  const urls: Record<string, string> = {}

  for (const remote of remotes) {
    const url = await getRemoteUrlFor(cwd, remote)
    if (url) {
      urls[remote] = url
    }
  }

  return urls
}

/**
 * Get remote URL for a specific remote name
 */
export async function getRemoteUrlFor(
  cwd: string,
  remoteName: string,
): Promise<string | null> {
  const result = await execFileNoThrow(
    'git',
    ['remote', 'get-url', remoteName],
    { cwd },
  )
  if (result.exitCode === 0) {
    return result.stdout.trim() || null
  }
  return null
}

// ============================================================================
// Working Tree Status
// ============================================================================

/**
 * Check if the working tree is clean
 */
export async function isWorkingTreeClean(cwd: string): Promise<boolean> {
  const result = await execFileNoThrow('git', ['status', '--porcelain'], {
    cwd,
  })
  return result.exitCode === 0 && result.stdout.trim() === ''
}

/**
 * Get git status in porcelain format
 */
export async function getStatus(cwd: string): Promise<string> {
  const result = await execFileNoThrow('git', ['status', '--porcelain'], {
    cwd,
  })
  return result.stdout.trim()
}

/**
 * Check if there are unstaged changes
 */
export async function hasUnstagedChanges(cwd: string): Promise<boolean> {
  const status = await getStatus(cwd)
  // Unstaged changes have space as the second character
  return status.split('\n').some(line => line.length >= 2 && line[1] !== ' ')
}

/**
 * Check if there are staged changes
 */
export async function hasStagedChanges(cwd: string): Promise<boolean> {
  const status = await getStatus(cwd)
  // Staged changes have non-space as the first character (excluding ??)
  return status
    .split('\n')
    .some(line => line.length >= 2 && line[0] !== ' ' && line[0] !== '?')
}

/**
 * Check if there are untracked files
 */
export async function hasUntrackedFiles(cwd: string): Promise<boolean> {
  const status = await getStatus(cwd)
  // Untracked files start with ??
  return status.split('\n').some(line => line.startsWith('??'))
}

// ============================================================================
// File Information
// ============================================================================

/**
 * Get all tracked files
 */
export async function getTrackedFiles(cwd: string): Promise<string[]> {
  const result = await execFileNoThrow('git', ['ls-files', '--cached'], { cwd })
  if (result.exitCode === 0) {
    return result.stdout.trim().split('\n').filter(Boolean)
  }
  return []
}

/**
 * Get all untracked files
 */
export async function getUntrackedFiles(cwd: string): Promise<string[]> {
  const result = await execFileNoThrow(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { cwd },
  )
  if (result.exitCode === 0) {
    return result.stdout.trim().split('\n').filter(Boolean)
  }
  return []
}

/**
 * Get modified files
 */
export async function getModifiedFiles(cwd: string): Promise<string[]> {
  const result = await execFileNoThrow(
    'git',
    ['diff', '--name-only', '--diff-filter=M'],
    { cwd },
  )
  if (result.exitCode === 0) {
    return result.stdout.trim().split('\n').filter(Boolean)
  }
  return []
}

/**
 * Get staged files
 */
export async function getStagedFiles(cwd: string): Promise<string[]> {
  const result = await execFileNoThrow(
    'git',
    ['diff', '--cached', '--name-only'],
    { cwd },
  )
  if (result.exitCode === 0) {
    return result.stdout.trim().split('\n').filter(Boolean)
  }
  return []
}

// ============================================================================
// Commit Information
// ============================================================================

/**
 * Get the current commit hash
 */
export async function getCommitHash(
  cwd: string,
  short: boolean = false,
): Promise<string | null> {
  const args = short ? ['rev-parse', '--short', 'HEAD'] : ['rev-parse', 'HEAD']
  const result = await execFileNoThrow('git', args, { cwd })
  if (result.exitCode === 0) {
    return result.stdout.trim() || null
  }
  return null
}

/**
 * Get the number of commits ahead of origin
 */
export async function getAheadCount(cwd: string): Promise<number> {
  const branch = await getBranch(cwd)
  if (!branch) return 0

  const result = await execFileNoThrow(
    'git',
    ['rev-list', '--count', `origin/${branch}..${branch}`],
    { cwd },
  )
  if (result.exitCode === 0) {
    return parseInt(result.stdout.trim(), 10) || 0
  }
  return 0
}

/**
 * Get the number of commits behind origin
 */
export async function getBehindCount(cwd: string): Promise<number> {
  const branch = await getBranch(cwd)
  if (!branch) return 0

  const result = await execFileNoThrow(
    'git',
    ['rev-list', '--count', `${branch}..origin/${branch}`],
    { cwd },
  )
  if (result.exitCode === 0) {
    return parseInt(result.stdout.trim(), 10) || 0
  }
  return 0
}

/**
 * Check if there are unpushed commits
 */
export async function hasUnpushedCommits(cwd: string): Promise<boolean> {
  const ahead = await getAheadCount(cwd)
  return ahead > 0
}

// ============================================================================
// Combined Status
// ============================================================================

/**
 * Get comprehensive git status
 */
export interface GitStatus {
  isGit: boolean
  root: string | null
  branch: string | null
  commit: string | null
  shortCommit: string | null
  defaultBranch: string
  remoteUrl: string | null
  normalizedRemoteUrl: string | null
  remoteUrlHash: string | null
  isClean: boolean
  hasStagedChanges: boolean
  hasUnstagedChanges: boolean
  hasUntrackedFiles: boolean
  ahead: number
  behind: number
  hasUnpushedCommits: boolean
}

/**
 * Get comprehensive git repository information
 */
export async function getGitStatus(cwd: string): Promise<GitStatus> {
  const isGit = await getIsGit(cwd)

  if (!isGit) {
    return {
      isGit: false,
      root: null,
      branch: null,
      commit: null,
      shortCommit: null,
      defaultBranch: 'main',
      remoteUrl: null,
      normalizedRemoteUrl: null,
      remoteUrlHash: null,
      isClean: true,
      hasStagedChanges: false,
      hasUnstagedChanges: false,
      hasUntrackedFiles: false,
      ahead: 0,
      behind: 0,
      hasUnpushedCommits: false,
    }
  }

  // Fetch all info concurrently
  const [
    root,
    branch,
    commit,
    shortCommit,
    defaultBranch,
    remoteUrl,
    isClean,
    _hasStagedChanges,
    _hasUnstagedChanges,
    _hasUntrackedFiles,
    ahead,
    behind,
  ] = await Promise.all([
    getGitRoot(cwd),
    getBranch(cwd),
    getCommitHash(cwd),
    getCommitHash(cwd, true),
    getDefaultBranch(cwd),
    getRemoteUrl(cwd),
    isWorkingTreeClean(cwd),
    hasStagedChanges(cwd),
    hasUnstagedChanges(cwd),
    hasUntrackedFiles(cwd),
    getAheadCount(cwd),
    getBehindCount(cwd),
  ])

  const normalizedRemoteUrl = remoteUrl ? normalizeRemoteUrl(remoteUrl) : null
  const remoteUrlHash = remoteUrl ? hashRemoteUrl(remoteUrl) : null

  return {
    isGit: true,
    root,
    branch,
    commit,
    shortCommit,
    defaultBranch,
    remoteUrl,
    normalizedRemoteUrl,
    remoteUrlHash,
    isClean,
    hasStagedChanges: _hasStagedChanges,
    hasUnstagedChanges: _hasUnstagedChanges,
    hasUntrackedFiles: _hasUntrackedFiles,
    ahead,
    behind,
    hasUnpushedCommits: ahead > 0,
  }
}
