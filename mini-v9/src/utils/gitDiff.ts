/**
 * Git diff utilities — fetch stats, hunks, and per-file diffs.
 * Adapted from the full src version for mini-v9.
 */

import { relative, sep, dirname } from 'path'
import { execFileNoThrow } from './execFileNoThrow.js'
import {
  findGitRoot,
  getDefaultBranch,
  getIsGit,
  getStatus,
} from './git.js'

// ============================================================
// Types
// ============================================================

export interface GitDiffStats {
  filesCount: number
  linesAdded: number
  linesRemoved: number
}

export interface PerFileStats {
  added: number
  removed: number
  isBinary: boolean
  isUntracked?: boolean
}

export interface StructuredHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export interface GitDiffResult {
  stats: GitDiffStats
  perFileStats: Map<string, PerFileStats>
  hunks: Map<string, StructuredHunk[]>
}

export interface ToolUseDiff {
  filename: string
  status: 'modified' | 'added'
  additions: number
  deletions: number
  changes: number
  patch: string
}

// ============================================================
// Constants
// ============================================================

const GIT_TIMEOUT_MS = 5000
const MAX_FILES = 50
const MAX_DIFF_SIZE_BYTES = 1_000_000
const MAX_LINES_PER_FILE = 400
const MAX_FILES_FOR_DETAILS = 500

// ============================================================
// Main API
// ============================================================

/**
 * Fetch git diff stats and per-file stats comparing working tree to HEAD.
 * Returns null if not in a git repo or if git commands fail.
 */
export async function fetchGitDiff(cwd: string): Promise<GitDiffResult | null> {
  const isGit = await getIsGit(cwd)
  if (!isGit) return null

  // Quick probe via --shortstat
  const { stdout: shortstatOut, exitCode: shortstatCode } = await execFileNoThrow(
    'git',
    ['--no-optional-locks', 'diff', 'HEAD', '--shortstat'],
    { cwd, timeout: GIT_TIMEOUT_MS },
  )
  if (shortstatCode === 0) {
    const quickStats = parseShortstat(shortstatOut)
    if (quickStats && quickStats.filesCount > MAX_FILES_FOR_DETAILS) {
      return { stats: quickStats, perFileStats: new Map(), hunks: new Map() }
    }
  }

  // Get stats via --numstat
  const { stdout: numstatOut, exitCode: numstatCode } = await execFileNoThrow(
    'git',
    ['--no-optional-locks', 'diff', 'HEAD', '--numstat'],
    { cwd, timeout: GIT_TIMEOUT_MS },
  )
  if (numstatCode !== 0) return null

  const { stats, perFileStats } = parseGitNumstat(numstatOut)

  // Include untracked files
  const remainingSlots = MAX_FILES - perFileStats.size
  if (remainingSlots > 0) {
    const { stdout: untrackedOut, exitCode: untrackedCode } = await execFileNoThrow(
      'git',
      ['ls-files', '--others', '--exclude-standard'],
      { cwd, timeout: GIT_TIMEOUT_MS },
    )
    if (untrackedCode === 0 && untrackedOut.trim()) {
      const untrackedFiles = untrackedOut.trim().split('\n').filter(Boolean)
      for (const filePath of untrackedFiles.slice(0, remainingSlots)) {
        perFileStats.set(filePath, {
          added: 0,
          removed: 0,
          isBinary: false,
          isUntracked: true,
        })
      }
      stats.filesCount += Math.min(untrackedFiles.length, remainingSlots)
    }
  }

  return { stats, perFileStats, hunks: new Map() }
}

/**
 * Fetch git diff hunks on-demand (for detailed views).
 * Separate from fetchGitDiff to avoid expensive calls during polling.
 */
export async function fetchGitDiffHunks(
  cwd: string,
): Promise<Map<string, StructuredHunk[]>> {
  const isGit = await getIsGit(cwd)
  if (!isGit) return new Map()

  const { stdout: diffOut, exitCode: diffCode } = await execFileNoThrow(
    'git',
    ['--no-optional-locks', 'diff', 'HEAD'],
    { cwd, timeout: GIT_TIMEOUT_MS },
  )
  if (diffCode !== 0) return new Map()

  return parseGitDiff(diffOut)
}

/**
 * Fetch a structured diff for a single file against the merge base
 * with the default branch. For untracked files, generates a synthetic diff.
 */
export async function fetchSingleFileGitDiff(
  cwd: string,
  absoluteFilePath: string,
): Promise<ToolUseDiff | null> {
  const gitRoot = await findGitRoot(dirname(absoluteFilePath))
  if (!gitRoot) return null

  const gitPath = relative(gitRoot, absoluteFilePath).split(sep).join('/')

  // Check if tracked
  const { exitCode: lsFilesCode } = await execFileNoThrow(
    'git',
    ['ls-files', '--error-unmatch', gitPath],
    { cwd: gitRoot, timeout: 3000 },
  )

  if (lsFilesCode === 0) {
    // Tracked — diff against merge base
    const diffRef = await getDiffRef(gitRoot)
    const { stdout, exitCode } = await execFileNoThrow(
      'git',
      ['diff', diffRef, '--', gitPath],
      { cwd: gitRoot, timeout: 3000 },
    )
    if (exitCode !== 0 || !stdout) return null
    return parseRawDiffToToolUseDiff(gitPath, stdout, 'modified')
  }

  return null
}

// ============================================================
// Parsers
// ============================================================

export interface NumstatResult {
  stats: GitDiffStats
  perFileStats: Map<string, PerFileStats>
}

/**
 * Parse git diff --numstat output.
 * Format: <added>\t<removed>\t<filename>
 */
export function parseGitNumstat(stdout: string): NumstatResult {
  const lines = stdout.trim().split('\n').filter(Boolean)
  let added = 0
  let removed = 0
  let validFileCount = 0
  const perFileStats = new Map<string, PerFileStats>()

  for (const line of lines) {
    const parts = line.split('\t')
    if (parts.length < 3) continue
    validFileCount++
    const addStr = parts[0]!
    const remStr = parts[1]!
    const filePath = parts.slice(2).join('\t')
    const isBinary = addStr === '-' || remStr === '-'
    const fileAdded = isBinary ? 0 : parseInt(addStr, 10) || 0
    const fileRemoved = isBinary ? 0 : parseInt(remStr, 10) || 0
    added += fileAdded
    removed += fileRemoved

    if (perFileStats.size < MAX_FILES) {
      perFileStats.set(filePath, { added: fileAdded, removed: fileRemoved, isBinary })
    }
  }

  return {
    stats: { filesCount: validFileCount, linesAdded: added, linesRemoved: removed },
    perFileStats,
  }
}

/**
 * Parse unified diff output into per-file hunks.
 * Applies size and line limits.
 */
export function parseGitDiff(stdout: string): Map<string, StructuredHunk[]> {
  const result = new Map<string, StructuredHunk[]>()
  if (!stdout.trim()) return result

  const fileDiffs = stdout.split(/^diff --git /m).filter(Boolean)

  for (const fileDiff of fileDiffs) {
    if (result.size >= MAX_FILES) break
    if (fileDiff.length > MAX_DIFF_SIZE_BYTES) continue

    const lines = fileDiff.split('\n')
    const headerMatch = lines[0]?.match(/^a\/(.+?) b\/(.+)$/)
    if (!headerMatch) continue
    const filePath = headerMatch[2] ?? headerMatch[1] ?? ''

    const fileHunks: StructuredHunk[] = []
    let currentHunk: StructuredHunk | null = null
    let lineCount = 0

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] ?? ''
      const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (hunkMatch) {
        if (currentHunk) fileHunks.push(currentHunk)
        currentHunk = {
          oldStart: parseInt(hunkMatch[1] ?? '0', 10),
          oldLines: parseInt(hunkMatch[2] ?? '1', 10),
          newStart: parseInt(hunkMatch[3] ?? '0', 10),
          newLines: parseInt(hunkMatch[4] ?? '1', 10),
          lines: [],
        }
        continue
      }

      if (
        line.startsWith('index ') ||
        line.startsWith('---') ||
        line.startsWith('+++') ||
        line.startsWith('new file') ||
        line.startsWith('deleted file') ||
        line.startsWith('Binary files')
      ) {
        continue
      }

      if (
        currentHunk &&
        (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')
      ) {
        if (lineCount >= MAX_LINES_PER_FILE) continue
        currentHunk.lines.push('' + line)
        lineCount++
      }
    }

    if (currentHunk) fileHunks.push(currentHunk)
    if (fileHunks.length > 0) result.set(filePath, fileHunks)
  }

  return result
}

/**
 * Parse git diff --shortstat output.
 * Format: "N files changed, N insertions(+), N deletions(-)"
 */
export function parseShortstat(stdout: string): GitDiffStats | null {
  const match = stdout.match(
    /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/,
  )
  if (!match) return null
  return {
    filesCount: parseInt(match[1] ?? '0', 10),
    linesAdded: parseInt(match[2] ?? '0', 10),
    linesRemoved: parseInt(match[3] ?? '0', 10),
  }
}

// ============================================================
// Internal helpers
// ============================================================

function parseRawDiffToToolUseDiff(
  filename: string,
  rawDiff: string,
  status: 'modified' | 'added',
): ToolUseDiff {
  const lines = rawDiff.split('\n')
  const patchLines: string[] = []
  let inHunks = false
  let additions = 0
  let deletions = 0

  for (const line of lines) {
    if (line.startsWith('@@')) inHunks = true
    if (inHunks) {
      patchLines.push(line)
      if (line.startsWith('+') && !line.startsWith('+++')) additions++
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++
    }
  }

  return {
    filename,
    status,
    additions,
    deletions,
    changes: additions + deletions,
    patch: patchLines.join('\n'),
  }
}

async function getDiffRef(gitRoot: string): Promise<string> {
  const defaultBranch = await getDefaultBranch(gitRoot)
  const { stdout, exitCode } = await execFileNoThrow(
    'git',
    ['merge-base', 'HEAD', `origin/${defaultBranch}`],
    { cwd: gitRoot, timeout: 3000 },
  )
  if (exitCode === 0 && stdout.trim()) return stdout.trim()
  return 'HEAD'
}
