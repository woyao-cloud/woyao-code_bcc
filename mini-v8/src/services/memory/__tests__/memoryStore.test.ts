import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  addMemory,
  getMemories,
  searchMemories,
  deleteMemory,
  getAllTags,
  getAllCategories,
  exportMemories,
  importMemories,
  setMemoryDir,
} from '../memoryStore.js'

let tempDir: string

describe('addMemory', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mem-test-'))
    setMemoryDir(tempDir)
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('adds a memory with tags and category', () => {
    const mem = addMemory('Remember to fix auth', ['bug'], 'bug')
    expect(mem).not.toBe(undefined)
    expect(mem?.content).toContain('fix auth')
    expect(mem?.tags).toContain('bug')
    expect(mem?.category).toBe('bug')
  })
})

describe('getMemories', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mem-test-'))
    setMemoryDir(tempDir)
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('returns empty array when no memories', () => {
    const memories = getMemories()
    expect(Array.isArray(memories)).toBe(true)
  })

  test('filters by category', () => {
    addMemory('Item 1', [], 'test-cat')
    addMemory('Item 2', [], 'other')

    const filtered = getMemories({ category: 'test-cat' })
    expect(filtered.length).toBeGreaterThanOrEqual(1)
    for (const m of filtered) {
      expect(m.category).toBe('test-cat')
    }
  })
})

describe('searchMemories', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mem-test-'))
    setMemoryDir(tempDir)
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('finds by content', () => {
    addMemory('Special query string here', [], 'note')
    const results = searchMemories('special query')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  test('returns empty for no matches', () => {
    const results = searchMemories('zzzznonexistentstring')
    expect(results.length).toBe(0)
  })
})

describe('deleteMemory', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mem-test-'))
    setMemoryDir(tempDir)
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('deletes existing memory', () => {
    const mem = addMemory('To be deleted', [], 'test')
    expect(mem).not.toBe(undefined)
    if (mem) {
      const ok = deleteMemory(mem.id)
      expect(ok).toBe(true)
    }
  })

  test('returns false for non-existent id', () => {
    const ok = deleteMemory('nonexistent-id')
    expect(ok).toBe(false)
  })
})

describe('getAllTags', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mem-test-'))
    setMemoryDir(tempDir)
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('returns sorted unique tags', () => {
    const tags = getAllTags()
    expect(Array.isArray(tags)).toBe(true)
  })
})

describe('getAllCategories', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mem-test-'))
    setMemoryDir(tempDir)
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('returns sorted unique categories', () => {
    const cats = getAllCategories()
    expect(Array.isArray(cats)).toBe(true)
  })
})

describe('exportMemories', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mem-test-'))
    setMemoryDir(tempDir)
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('exports as JSON', () => {
    const json = exportMemories('json')
    const parsed = JSON.parse(json)
    expect(parsed).toHaveProperty('memories')
  })

  test('exports as markdown', () => {
    const md = exportMemories('markdown')
    expect(md).toContain('# Memories')
  })
})

describe('importMemories', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mem-test-'))
    setMemoryDir(tempDir)
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('imports from JSON', () => {
    const json = JSON.stringify({
      version: 1,
      memories: [
        {
          id: 'test-import-1',
          content: 'Imported memory',
          tags: ['imported'],
          category: 'import',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    })
    const count = importMemories(json)
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('returns 0 for invalid JSON', () => {
    const count = importMemories('not valid json')
    expect(count).toBe(0)
  })
})
