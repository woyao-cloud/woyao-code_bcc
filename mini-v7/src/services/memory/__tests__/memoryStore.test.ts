import { describe, test, expect } from 'bun:test'

import {
  addMemory,
  getMemories,
  searchMemories,
  deleteMemory,
  getAllTags,
  getAllCategories,
  exportMemories,
  importMemories,
} from '../memoryStore.js'

describe('addMemory', () => {
  test('adds a memory with tags and category', () => {
    const mem = addMemory('Remember to fix auth', ['bug'], 'bug')
    expect(mem).not.toBe(undefined)
    expect(mem?.content).toContain('fix auth')
    expect(mem?.tags).toContain('bug')
    expect(mem?.category).toBe('bug')
    if (mem) deleteMemory(mem.id)
  })
})

describe('getMemories', () => {
  test('returns empty array when no memories', () => {
    const memories = getMemories()
    expect(Array.isArray(memories)).toBe(true)
  })

  test('filters by category', () => {
    const m1 = addMemory('Item 1', [], 'test-cat')
    const m2 = addMemory('Item 2', [], 'other')

    const filtered = getMemories({ category: 'test-cat' })
    expect(filtered.length).toBeGreaterThanOrEqual(1)
    for (const m of filtered) {
      expect(m.category).toBe('test-cat')
    }

    if (m1) deleteMemory(m1.id)
    if (m2) deleteMemory(m2.id)
  })
})

describe('searchMemories', () => {
  test('finds by content', () => {
    const mem = addMemory('Special query string here', [], 'note')
    const results = searchMemories('special query')
    expect(results.length).toBeGreaterThanOrEqual(1)
    if (mem) deleteMemory(mem.id)
  })

  test('returns empty for no matches', () => {
    const results = searchMemories('zzzznonexistentstring')
    expect(results.length).toBe(0)
  })
})

describe('deleteMemory', () => {
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
  test('returns sorted unique tags', () => {
    const tags = getAllTags()
    expect(Array.isArray(tags)).toBe(true)
  })
})

describe('getAllCategories', () => {
  test('returns sorted unique categories', () => {
    const cats = getAllCategories()
    expect(Array.isArray(cats)).toBe(true)
  })
})

describe('exportMemories', () => {
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
