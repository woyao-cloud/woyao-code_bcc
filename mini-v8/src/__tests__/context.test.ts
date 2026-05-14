import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getSystemContext } from '../context.js'
import {
  initSession,
  endSession,
  persistSessionMemory,
  setSessionMemoryDir,
  SESSION_MEMORY_COMPACTION_MARKER,
} from '../services/memory/sessionMemory.js'

let tempDir: string

describe('getSystemContext', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mini-v8-context-'))
    setSessionMemoryDir(tempDir)
    initSession()
  })

  afterEach(() => {
    endSession()
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('returns a non-empty string', async () => {
    const ctx = await getSystemContext()
    expect(typeof ctx).toBe('string')
    expect(ctx.length).toBeGreaterThan(0)
  })

  test('contains current date', async () => {
    const ctx = await getSystemContext()
    expect(ctx).toContain('Current date:')
  })

  test('contains working directory', async () => {
    const ctx = await getSystemContext()
    expect(ctx).toContain('Working directory:')
  })

  test('does not throw', async () => {
    let threw = false
    try {
      await getSystemContext()
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })

  test('injects session memory into a fresh conversation slice', async () => {
    persistSessionMemory([
      {
        id: 'note-1',
        category: 'decision',
        content: 'Carry forward the auth migration plan',
        timestamp: new Date().toISOString(),
      },
    ])

    const ctx = await getSystemContext(undefined, {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeClaudeMd: false,
      includeSkills: false,
      includeMemories: false,
      includeAgents: false,
      includeTeams: false,
      sessionMemoryMode: 'auto',
      conversationMessages: [
        { role: 'user', content: 'Continue after clearing the REPL' },
      ],
    })

    expect(ctx).toContain('Session Memory (auto-extracted)')
    expect(ctx).toContain('Carry forward the auth migration plan')
  })

  test('skips session memory once compact summary already consumed it', async () => {
    persistSessionMemory([
      {
        id: 'note-1',
        category: 'decision',
        content: 'Carry forward the auth migration plan',
        timestamp: new Date().toISOString(),
      },
    ])

    const ctx = await getSystemContext(undefined, {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeClaudeMd: false,
      includeSkills: false,
      includeMemories: false,
      includeAgents: false,
      includeTeams: false,
      sessionMemoryMode: 'auto',
      conversationMessages: [
        { role: 'user', content: 'Continue after compact' },
        {
          role: 'assistant',
          content:
            SESSION_MEMORY_COMPACTION_MARKER +
            '\n## Session Memory (auto-extracted)\n- Carry forward the auth migration plan',
        },
      ],
    })

    expect(ctx).toBe('')
  })
})
