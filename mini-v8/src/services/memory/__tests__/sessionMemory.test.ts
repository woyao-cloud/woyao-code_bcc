import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  initSession,
  endSession,
  getSessionId,
  getSessionMemoryConfig,
  setSessionMemoryConfig,
  estimateTotalTokens,
  shouldExtractMemory,
  extractSessionNotes,
  persistSessionMemory,
  readSessionMemory,
  setSessionMemoryDir,
  type SessionMemoryNote,
} from '../sessionMemory.js'

let tempDir: string

describe('initSession', () => {
  test('creates a new session ID', () => {
    initSession()
    const id = getSessionId()
    expect(id).not.toBe(null)
    expect(typeof id).toBe('string')
    expect(String(id)).toContain('session-')
  })
})

describe('getSessionMemoryConfig', () => {
  test('returns default config when disabled', () => {
    const config = getSessionMemoryConfig()
    expect(config.enabled).toBe(false)
    expect(config.maxNotes).toBe(30)
  })
})

describe('setSessionMemoryConfig', () => {
  test('updates config', () => {
    setSessionMemoryConfig({ enabled: true, maxNotes: 50 })
    const config = getSessionMemoryConfig()
    expect(config.enabled).toBe(true)
    expect(config.maxNotes).toBe(50)
    setSessionMemoryConfig({ enabled: false, maxNotes: 30 })
  })
})

describe('estimateTotalTokens', () => {
  test('estimates tokens for string content', () => {
    const tokens = estimateTotalTokens([
      { role: 'user', content: 'Hello, this is a test message.' },
    ])
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeLessThan(50)
  })

  test('returns 0 for empty messages', () => {
    const tokens = estimateTotalTokens([])
    expect(tokens).toBe(0)
  })
})

describe('shouldExtractMemory', () => {
  test('returns false when disabled', () => {
    setSessionMemoryConfig({ enabled: false })
    const result = shouldExtractMemory([
      { role: 'user', content: 'A'.repeat(10000) },
    ])
    expect(result).toBe(false)
  })
})

describe('extractSessionNotes', () => {
  test('extracts user messages as notes', () => {
    const notes = extractSessionNotes([
      { role: 'user', content: 'Fix the login bug' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: "I'll look at it." }],
      },
    ])
    expect(notes.length).toBeGreaterThan(0)
  })

  test('returns empty array when no messages', () => {
    const notes = extractSessionNotes([])
    expect(notes.length).toBe(0)
  })
})

describe('persistSessionMemory and readSessionMemory', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'smem-test-'))
    setSessionMemoryDir(tempDir)
    initSession()
  })

  afterEach(() => {
    endSession()
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('writes and reads session memory', () => {
    const id = getSessionId()
    expect(id).not.toBe(null)

    const notes: SessionMemoryNote[] = [
      {
        id: 'note-1',
        category: 'decision',
        content: 'Decided to use PostgreSQL',
        timestamp: new Date().toISOString(),
      },
    ]

    persistSessionMemory(notes)

    if (id) {
      const read = readSessionMemory(id)
      expect(read.length).toBeGreaterThan(0)
      expect(read[0]?.content).toBe('Decided to use PostgreSQL')
    }
  })
})
