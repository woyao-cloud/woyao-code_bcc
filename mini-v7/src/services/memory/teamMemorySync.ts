// ============================================================
// Team Memory Sync for mini-v7
// ============================================================
// Syncs team memory files between local filesystem and server.
// Uses content-hash based delta uploads and ETag-based pulls.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  rmSync,
} from 'fs'
import { join, basename } from 'path'
import { createHash } from 'crypto'
import { homedir } from 'os'

// ============================================================
// Types
// ============================================================

export interface TeamMemoryEntry {
  key: string
  content: string
  checksum: string
}

export interface TeamMemoryData {
  entries: TeamMemoryEntry[]
  entryChecksums?: Record<string, string>
}

export interface TeamMemorySyncConfig {
  enabled: boolean
  /** Git repo slug (owner/repo) for scoping */
  repoSlug?: string
  /** Server API base URL */
  apiBaseUrl?: string
  /** Max file size to sync */
  maxFileSize: number
}

export interface TeamMemorySyncState {
  lastKnownChecksum: string | null
  serverChecksums: Map<string, string>
  suppressedPaths: Set<string>
}

// ============================================================
// Config
// ============================================================

const DEFAULT_CONFIG: TeamMemorySyncConfig = {
  enabled: false,
  maxFileSize: 250_000,
}

let syncConfig: TeamMemorySyncConfig = { ...DEFAULT_CONFIG }

function getTeamMemDir(): string {
  const dir = join(homedir(), '.claude-code-mini', 'team-memory')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

// ============================================================
// Config management
// ============================================================

export function getTeamSyncConfig(): TeamMemorySyncConfig {
  return { ...syncConfig }
}

export function setTeamSyncConfig(
  updates: Partial<TeamMemorySyncConfig>,
): void {
  syncConfig = { ...syncConfig, ...updates }
}

// ============================================================
// State management
// ============================================================

export function createSyncState(): TeamMemorySyncState {
  return {
    lastKnownChecksum: null,
    serverChecksums: new Map(),
    suppressedPaths: new Set(),
  }
}

// ============================================================
// Content hashing
// ============================================================

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function hashEntry(content: string): string {
  return sha256(content)
}

// ============================================================
// Local file operations
// ============================================================

/** Scan local team memory directory for files */
export function scanLocalTeamMemories(): TeamMemoryEntry[] {
  const dir = getTeamMemDir()
  if (!existsSync(dir)) return []

  const entries: TeamMemoryEntry[] = []
  try {
    for (const entry of readdirSync(dir)) {
      const filePath = join(dir, entry)
      if (!statSync(filePath).isFile()) continue
      if (!entry.endsWith('.md')) continue

      try {
        const content = readFileSync(filePath, 'utf-8')
        if (content.length > syncConfig.maxFileSize) continue

        const key = entry.replace(/\.md$/, '')
        entries.push({
          key,
          content,
          checksum: hashEntry(content),
        })
      } catch {}
    }
  } catch {}

  return entries
}

/** Write a team memory entry to local disk */
export function writeTeamMemory(key: string, content: string): void {
  const filePath = join(getTeamMemDir(), `${key}.md`)
  try {
    writeFileSync(filePath, content, 'utf-8')
  } catch {}
}

/** Remove a team memory file locally */
export function removeTeamMemory(key: string): void {
  const filePath = join(getTeamMemDir(), `${key}.md`)
  if (existsSync(filePath)) {
    try {
      rmSync(filePath)
    } catch {}
  }
}

// ============================================================
// API operations
// ============================================================

async function teamMemoryRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const config = syncConfig
  const baseUrl =
    config.apiBaseUrl || 'https://api.anthropic.com/api/claude_code/team_memory'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (process.env.ANTHROPIC_API_KEY) {
    headers['x-api-key'] = process.env.ANTHROPIC_API_KEY
  }

  const queryParams = config.repoSlug
    ? `?repo=${encodeURIComponent(config.repoSlug)}`
    : ''

  const url = `${baseUrl}${path}${queryParams}`
  const init: RequestInit = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }

  const response = await fetch(url, init)
  if (response.status === 404) {
    return { entries: [] } as unknown as T
  }
  if (!response.ok) {
    throw new Error(
      `Team memory sync error: ${response.status} ${response.statusText}`,
    )
  }
  return response.json() as Promise<T>
}

/**
 * Pull team memory from server to local.
 * Server entries overwrite local files (server wins).
 */
export async function pullTeamMemory(
  state: TeamMemorySyncState,
): Promise<{ success: boolean; filesWritten: number; error?: string }> {
  if (!syncConfig.enabled) {
    return {
      success: false,
      filesWritten: 0,
      error: 'Team memory sync disabled',
    }
  }

  try {
    const data = await teamMemoryRequest<TeamMemoryData>('GET', '')

    let filesWritten = 0
    for (const entry of data.entries) {
      try {
        writeTeamMemory(entry.key, entry.content)
        filesWritten++
      } catch {}
    }

    if (data.entryChecksums) {
      state.serverChecksums.clear()
      for (const [key, checksum] of Object.entries(data.entryChecksums)) {
        state.serverChecksums.set(key, checksum)
      }
    }

    return { success: true, filesWritten }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, filesWritten: 0, error: msg }
  }
}

/**
 * Push local team memory to server.
 * Delta upload: only push files whose checksum differs from server.
 */
export async function pushTeamMemory(
  state: TeamMemorySyncState,
): Promise<{ success: boolean; filesUploaded: number; error?: string }> {
  if (!syncConfig.enabled) {
    return {
      success: false,
      filesUploaded: 0,
      error: 'Team memory sync disabled',
    }
  }

  try {
    const local = scanLocalTeamMemories()
    const toUpload: TeamMemoryEntry[] = []

    for (const entry of local) {
      const serverChecksum = state.serverChecksums.get(entry.key)
      if (serverChecksum !== entry.checksum) {
        toUpload.push(entry)
      }
    }

    if (toUpload.length === 0) {
      return { success: true, filesUploaded: 0 }
    }

    const uploadData: { entries: TeamMemoryEntry[] } = { entries: toUpload }
    await teamMemoryRequest('PUT', '', uploadData)

    // Update local checksum cache
    for (const entry of toUpload) {
      state.serverChecksums.set(entry.key, entry.checksum)
    }

    return { success: true, filesUploaded: toUpload.length }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, filesUploaded: 0, error: msg }
  }
}

/**
 * Full bidirectional sync: pull then push.
 */
export async function syncTeamMemory(state: TeamMemorySyncState): Promise<{
  success: boolean
  filesPulled: number
  filesPushed: number
  error?: string
}> {
  const pullResult = await pullTeamMemory(state)
  if (!pullResult.success) {
    return {
      success: false,
      filesPulled: 0,
      filesPushed: 0,
      error: pullResult.error,
    }
  }

  const pushResult = await pushTeamMemory(state)
  return {
    success: pushResult.success,
    filesPulled: pullResult.filesWritten,
    filesPushed: pushResult.filesUploaded,
    error: pushResult.error,
  }
}

// ============================================================
// Team memory for context injection
// ============================================================

/**
 * Get team memory content for injection into the system prompt.
 */
export function getTeamMemoryForPrompt(): string {
  const entries = scanLocalTeamMemories()
  if (entries.length === 0) return ''

  const lines = ['', '## Team Memory', '']
  for (const entry of entries.slice(0, 10)) {
    const preview = entry.content.slice(0, 300).split('\n')[0] ?? ''
    lines.push(`- ${entry.key}: ${preview}`)
  }
  lines.push('')
  return lines.join('\n')
}
