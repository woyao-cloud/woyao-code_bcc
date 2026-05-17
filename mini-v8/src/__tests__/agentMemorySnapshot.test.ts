import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  checkAgentMemorySnapshot,
  initializeFromSnapshot,
  replaceFromSnapshot,
  markSnapshotSynced,
  createSnapshot,
  listSnapshots,
  deleteSnapshot,
} from '../agents/agentMemorySnapshot.js'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mini-v8-snapshot-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

function createSnapshotFiles(
  agentType: string,
  files: Record<string, string>,
): void {
  const dir = join(tempDir, '.claude', 'agent-memory-snapshots', agentType)
  mkdirSync(dir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf-8')
  }
}

function createMemoryDir(
  agentType: string,
  files?: Record<string, string>,
): string {
  const dir = join(tempDir, '.claude', 'agent-memory', agentType)
  mkdirSync(dir, { recursive: true })
  if (files) {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content, 'utf-8')
    }
  }
  return dir
}

describe('checkAgentMemorySnapshot', () => {
  test('returns none when no snapshot exists', () => {
    const result = checkAgentMemorySnapshot('MyAgent', tempDir)
    expect(result.action).toBe('none')
  })

  test('returns initialize when snapshot exists but no memory dir', () => {
    createSnapshotFiles('MyAgent', { 'user_role.md': '# Role' })
    const result = checkAgentMemorySnapshot('MyAgent', tempDir)
    expect(result.action).toBe('initialize')
  })

  test('returns prompt-update when snapshot changed', () => {
    createSnapshotFiles('MyAgent', {
      'user_role.md': '# Role v1 (longer content)',
    })
    createMemoryDir('MyAgent', { 'user_role.md': '# Role v1 (longer content)' })
    markSnapshotSynced('MyAgent', tempDir)

    // Change snapshot with different content size
    createSnapshotFiles('MyAgent', { 'user_role.md': '# Role v2' })
    const result = checkAgentMemorySnapshot('MyAgent', tempDir)
    expect(result.action).toBe('prompt-update')
  })

  test('returns none when snapshot synced and unchanged', () => {
    createSnapshotFiles('MyAgent', { 'user_role.md': '# Role' })
    createMemoryDir('MyAgent', { 'user_role.md': '# Role' })
    markSnapshotSynced('MyAgent', tempDir)

    const result = checkAgentMemorySnapshot('MyAgent', tempDir)
    expect(result.action).toBe('none')
  })
})

describe('initializeFromSnapshot', () => {
  test('copies snapshot files to memory directory', () => {
    createSnapshotFiles('MyAgent', {
      'user_role.md': '# User Role',
      'prefs.md': '# Preferences',
      'MEMORY.md': '# Index\n- [Role](user_role.md)',
    })

    initializeFromSnapshot(
      'MyAgent',
      join(tempDir, '.claude', 'agent-memory', 'MyAgent'),
      tempDir,
    )

    const memDir = join(tempDir, '.claude', 'agent-memory', 'MyAgent')
    expect(existsSync(join(memDir, 'user_role.md'))).toBe(true)
    expect(existsSync(join(memDir, 'prefs.md'))).toBe(true)
    expect(existsSync(join(memDir, 'MEMORY.md'))).toBe(true)
  })
})

describe('replaceFromSnapshot', () => {
  test('replaces existing memory files with snapshot', () => {
    createSnapshotFiles('MyAgent', { 'new_role.md': '# New Role' })
    createMemoryDir('MyAgent', { 'old_role.md': '# Old Role' })

    replaceFromSnapshot(
      'MyAgent',
      join(tempDir, '.claude', 'agent-memory', 'MyAgent'),
      tempDir,
    )

    const memDir = join(tempDir, '.claude', 'agent-memory', 'MyAgent')
    expect(existsSync(join(memDir, 'new_role.md'))).toBe(true)
    expect(existsSync(join(memDir, 'old_role.md'))).toBe(false)
  })
})

describe('markSnapshotSynced', () => {
  test('writes sync state file', () => {
    createSnapshotFiles('MyAgent', { 'test.md': 'test' })
    createMemoryDir('MyAgent', { 'test.md': 'test' })

    markSnapshotSynced('MyAgent', tempDir)

    const statePath = join(
      tempDir,
      '.claude',
      'agent-memory-snapshots',
      '.snapshot-synced.json',
    )
    expect(existsSync(statePath)).toBe(true)
  })
})

describe('createSnapshot', () => {
  test('creates snapshot from memory files', () => {
    createMemoryDir('MyAgent', { 'mem1.md': '# Content' })
    const memDir = join(tempDir, '.claude', 'agent-memory', 'MyAgent')

    // createSnapshot takes (agentType, files, cwd) where files is a Record<string, string>
    // We need to read the memory dir and create snapshot from those files
    createSnapshot('MyAgent', { 'mem1.md': '# Content' }, tempDir)

    const snapDir = join(
      tempDir,
      '.claude',
      'agent-memory-snapshots',
      'MyAgent',
    )
    expect(existsSync(join(snapDir, 'mem1.md'))).toBe(true)
  })
})

describe('listSnapshots', () => {
  test('returns empty when no snapshots exist', () => {
    const snapshots = listSnapshots(tempDir)
    expect(snapshots).toEqual([])
  })

  test('lists available snapshot agent types', () => {
    createSnapshotFiles('AgentA', { 'a.md': 'a' })
    createSnapshotFiles('AgentB', { 'b.md': 'b' })

    const snapshots = listSnapshots(tempDir)
    expect(snapshots).toContain('AgentA')
    expect(snapshots).toContain('AgentB')
  })

  test('excludes .snapshot-synced.json', () => {
    createSnapshotFiles('MyAgent', { 'test.md': 'test' })
    const snapshots = listSnapshots(tempDir)
    expect(snapshots).not.toContain('.snapshot-synced.json')
  })
})

describe('deleteSnapshot', () => {
  test('deletes snapshot for an agent type', () => {
    createSnapshotFiles('MyAgent', { 'test.md': 'test' })
    expect(listSnapshots(tempDir).length).toBe(1)

    deleteSnapshot('MyAgent', tempDir)
    expect(listSnapshots(tempDir).length).toBe(0)
  })

  test('returns false for non-existent snapshot', () => {
    const result = deleteSnapshot('NoAgent', tempDir)
    expect(result).toBe(false)
  })
})
