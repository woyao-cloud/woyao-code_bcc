// ============================================================
// Agent Memory Snapshot Sync for mini-v8
// ============================================================
// Manages snapshot-based memory initialization for agents.
// Snapshots provide a base set of memory files that can be
// copied into an agent's memory directory on first run.
//
// Snapshot location: .claude/agent-memory-snapshots/<agentType>/
// Sync state:        .claude/agent-memory-snapshots/.snapshot-synced.json
// ============================================================

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  unlinkSync,
  rmSync,
} from 'fs'
import { join } from 'path'

// ---------- Types ----------

export interface SnapshotCheck {
  action: 'none' | 'initialize' | 'prompt-update'
  reason?: string
}

interface SyncState {
  [agentType: string]: {
    lastSyncTimestamp: number
    snapshotHash?: string
  }
}

// ---------- Path Helpers ----------

function getSnapshotDir(cwd?: string): string {
  return join(cwd ?? process.cwd(), '.claude', 'agent-memory-snapshots')
}

function getSyncStatePath(cwd?: string): string {
  return join(getSnapshotDir(cwd), '.snapshot-synced.json')
}

function getAgentSnapshotDir(agentType: string, cwd?: string): string {
  return join(getSnapshotDir(cwd), agentType)
}

// ---------- Sync State ----------

function loadSyncState(cwd?: string): SyncState {
  const path = getSyncStatePath(cwd)
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SyncState
  } catch {
    return {}
  }
}

function saveSyncState(state: SyncState, cwd?: string): void {
  const dir = getSnapshotDir(cwd)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(getSyncStatePath(cwd), JSON.stringify(state, null, 2), 'utf-8')
}

function computeSnapshotHash(agentType: string, cwd?: string): string {
  const dir = getAgentSnapshotDir(agentType, cwd)
  if (!existsSync(dir)) return ''

  try {
    const entries = readdirSync(dir)
      .filter(e => e.endsWith('.md'))
      .sort()

    if (entries.length === 0) return ''

    const parts: string[] = []
    for (const entry of entries) {
      const stat = readFileSync(join(dir, entry), 'utf-8')
      parts.push(`${entry}:${stat.length}`)
    }

    return parts.join('|')
  } catch {
    return ''
  }
}

// ---------- Check ----------

export function checkAgentMemorySnapshot(
  agentType: string,
  cwd?: string,
): SnapshotCheck {
  const snapshotDir = getAgentSnapshotDir(agentType, cwd)

  // No snapshot exists
  if (!existsSync(snapshotDir)) {
    return { action: 'none', reason: 'No snapshot directory found' }
  }

  // Check if there are snapshot files
  try {
    const files = readdirSync(snapshotDir).filter(e => e.endsWith('.md'))
    if (files.length === 0) {
      return { action: 'none', reason: 'Snapshot directory is empty' }
    }
  } catch {
    return { action: 'none', reason: 'Cannot read snapshot directory' }
  }

  const syncState = loadSyncState(cwd)
  const lastSync = syncState[agentType]

  // First time — initialize
  if (!lastSync) {
    return {
      action: 'initialize',
      reason: 'Agent memory has never been synced',
    }
  }

  // Check if snapshot has changed since last sync
  const currentHash = computeSnapshotHash(agentType, cwd)
  if (currentHash && currentHash !== (lastSync.snapshotHash ?? '')) {
    return {
      action: 'prompt-update',
      reason: 'Snapshot has been updated since last sync',
    }
  }

  return { action: 'none' }
}

// ---------- Initialize ----------

export function initializeFromSnapshot(
  agentType: string,
  targetMemoryDir: string,
  cwd?: string,
): string[] {
  const snapshotDir = getAgentSnapshotDir(agentType, cwd)
  const copied: string[] = []

  if (!existsSync(snapshotDir)) return copied

  // Ensure target exists
  if (!existsSync(targetMemoryDir)) {
    mkdirSync(targetMemoryDir, { recursive: true })
  }

  try {
    const files = readdirSync(snapshotDir).filter(e => e.endsWith('.md'))
    for (const file of files) {
      const src = join(snapshotDir, file)
      const dest = join(targetMemoryDir, file)
      copyFileSync(src, dest)
      copied.push(file)
    }
  } catch {
    // Partial copy — caller should check return value
  }

  return copied
}

// ---------- Replace ----------

export function replaceFromSnapshot(
  agentType: string,
  targetMemoryDir: string,
  cwd?: string,
): string[] {
  const snapshotDir = getAgentSnapshotDir(agentType, cwd)
  const copied: string[] = []

  if (!existsSync(snapshotDir)) return copied

  // Clear existing memory files
  if (existsSync(targetMemoryDir)) {
    try {
      const existing = readdirSync(targetMemoryDir).filter(e =>
        e.endsWith('.md'),
      )
      for (const file of existing) {
        unlinkSync(join(targetMemoryDir, file))
      }
    } catch {
      // If we can't clear, try to remove and recreate
      try {
        rmSync(targetMemoryDir, { recursive: true, force: true })
        mkdirSync(targetMemoryDir, { recursive: true })
      } catch {
        return copied
      }
    }
  } else {
    mkdirSync(targetMemoryDir, { recursive: true })
  }

  try {
    const files = readdirSync(snapshotDir).filter(e => e.endsWith('.md'))
    for (const file of files) {
      const src = join(snapshotDir, file)
      const dest = join(targetMemoryDir, file)
      copyFileSync(src, dest)
      copied.push(file)
    }
  } catch {
    // Partial copy
  }

  return copied
}

// ---------- Mark Synced ----------

export function markSnapshotSynced(agentType: string, cwd?: string): void {
  const syncState = loadSyncState(cwd)
  const hash = computeSnapshotHash(agentType, cwd)

  syncState[agentType] = {
    lastSyncTimestamp: Date.now(),
    snapshotHash: hash || undefined,
  }

  saveSyncState(syncState, cwd)
}

// ---------- Snapshot CRUD (for managing snapshots) ----------

export function createSnapshot(
  agentType: string,
  files: Record<string, string>,
  cwd?: string,
): string {
  const dir = getAgentSnapshotDir(agentType, cwd)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  for (const [filename, content] of Object.entries(files)) {
    const name = filename.endsWith('.md') ? filename : `${filename}.md`
    writeFileSync(join(dir, name), content, 'utf-8')
  }

  return dir
}

export function listSnapshots(cwd?: string): string[] {
  const dir = getSnapshotDir(cwd)
  if (!existsSync(dir)) return []

  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
  } catch {
    return []
  }
}

export function deleteSnapshot(agentType: string, cwd?: string): boolean {
  const dir = getAgentSnapshotDir(agentType, cwd)
  if (!existsSync(dir)) return false

  try {
    rmSync(dir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}
