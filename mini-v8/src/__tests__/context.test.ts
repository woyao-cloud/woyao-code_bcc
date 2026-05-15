import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getSystemContext } from '../context.js'
import { addMemory, setMemoryDir } from '../services/memory/memoryStore.js'
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
    setMemoryDir(tempDir)
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

  test('uses query-aware memory retrieval for the prompt', async () => {
    addMemory('Fix auth retry flow in src/auth.ts', ['auth'], 'bug')
    addMemory('Landing page color review notes', ['design'], 'note')

    const ctx = await getSystemContext(undefined, {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeClaudeMd: false,
      includeSkills: false,
      includeAgents: false,
      includeTeams: false,
      includeMemoriesOnlyWhenRelevant: false,
      maxContextTokens: 300,
      conversationMessages: [
        { role: 'user', content: 'continue the auth retry fix' },
      ],
    })

    expect(ctx).toContain('Fix auth retry flow')
    expect(ctx).not.toContain('Landing page color review notes')
  })

  test('drops optional context blocks when the prompt budget is tight', async () => {
    addMemory(
      'Fix auth retry flow in src/auth.ts and keep the migration rationale handy.',
      ['auth'],
      'bug',
    )

    const ctx = await getSystemContext(undefined, {
      maxContextTokens: 30,
      conversationMessages: [
        { role: 'user', content: 'continue the auth retry fix' },
      ],
    })

    expect(ctx).toContain('Current date:')
    expect(ctx).toContain('Working directory:')
    expect(ctx).not.toContain('User Memories')
  })
})
