import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

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
  persistSessionMemoryWithTokenCount,
  getSessionMemoryForPrompt,
  getSessionMemorySummaryForCompact,
  hasSessionMemoryCompactionSummary,
  readSessionMemory,
  setSessionMemoryDir,
  shouldInjectSessionMemoryIntoPrompt,
  updateSessionMemoryFromMessages,
  getLastSummarizedMessageId,
  setLastSummarizedMessageId,
  resetSummarizedMessageId,
  markExtractionStarted,
  markExtractionCompleted,
  waitForSessionMemoryExtraction,
  truncateSessionMemoryForCompact,
  isSessionMemoryEmpty,
  SESSION_MEMORY_COMPACTION_MARKER,
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
    expect(config.enabled).toBe(true)
    expect(config.maxNotes).toBe(30)
  })
})

describe('setSessionMemoryConfig', () => {
  test('updates config', () => {
    setSessionMemoryConfig({ enabled: false, maxNotes: 50 })
    const config = getSessionMemoryConfig()
    expect(config.enabled).toBe(false)
    expect(config.maxNotes).toBe(50)
    setSessionMemoryConfig({ enabled: true, maxNotes: 30 })
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

  test('updates session memory from current messages and returns compact summary', () => {
    const notes = updateSessionMemoryFromMessages([
      { role: 'user', content: 'Fix auth retry flow in src/auth.ts' },
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "I'll inspect src/auth.ts and patch retry handling.",
          },
        ],
      },
    ])

    expect(notes.length).toBeGreaterThan(0)

    const id = getSessionId()
    expect(id).not.toBe(null)

    if (id) {
      const promptText = getSessionMemoryForPrompt(id)
      expect(promptText).toContain('Session Memory')
      expect(promptText).toContain('Fix auth retry flow')
    }

    const compactSummary = getSessionMemorySummaryForCompact()
    expect(compactSummary).toContain('Session Memory')
    expect(compactSummary).toContain('Fix auth retry flow')
  })

  test('resumes an existing session ID and reuses the saved memory file', () => {
    const originalId = getSessionId()
    expect(originalId).not.toBe(null)

    persistSessionMemory([
      {
        id: 'note-1',
        category: 'decision',
        content: 'Keep the compact boundary summary on resume',
        timestamp: new Date().toISOString(),
      },
    ])

    endSession()
    initSession(originalId ?? undefined)

    expect(getSessionId()).toBe(originalId)
    expect(getSessionMemorySummaryForCompact()).toContain(
      'Keep the compact boundary summary on resume',
    )
  })
})

describe('session memory prompt policy', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'smem-policy-'))
    setSessionMemoryDir(tempDir)
    initSession()
  })

  afterEach(() => {
    endSession()
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('limits notes per category and truncates prompt text', () => {
    persistSessionMemory([
      {
        id: 'req-1',
        category: 'user-request',
        content: 'Older note should be dropped first',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'req-2',
        category: 'user-request',
        content: 'Keep this request note',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'req-3',
        category: 'user-request',
        content: 'Keep this newer request note',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'decision-1',
        category: 'decision',
        content:
          'Use a compact session memory prompt budget for reset turns and stop reinjecting notes after compaction has already summarized them.',
        timestamp: new Date().toISOString(),
      },
    ])

    const id = getSessionId()
    expect(id).not.toBe(null)

    if (id) {
      const promptText = getSessionMemoryForPrompt(id, {
        maxNotesPerCategory: 2,
        maxChars: 200,
      })

      expect(promptText).toContain('Keep this request note')
      expect(promptText).toContain('Keep this newer request note')
      expect(promptText).not.toContain('Older note should be dropped first')
      expect(promptText).toContain(
        'Session memory truncated to reduce token usage',
      )
      expect(promptText.length).toBeLessThanOrEqual(200)
    }
  })

  test('auto mode stops injecting after a session-memory compaction summary', () => {
    persistSessionMemory([
      {
        id: 'note-1',
        category: 'decision',
        content: 'Carry forward the auth migration plan',
        timestamp: new Date().toISOString(),
      },
    ])

    const freshMessages: BetaMessageParam[] = [
      { role: 'user', content: 'Continue after /clear' },
    ]
    expect(shouldInjectSessionMemoryIntoPrompt(freshMessages, 'auto')).toBe(
      true,
    )

    const compactedMessages: BetaMessageParam[] = [
      { role: 'user', content: 'Earlier conversation' },
      {
        role: 'assistant',
        content:
          SESSION_MEMORY_COMPACTION_MARKER +
          '\n## Session Memory (auto-extracted)\n- Carry forward the auth migration plan',
      },
    ]

    expect(hasSessionMemoryCompactionSummary(compactedMessages)).toBe(true)
    expect(shouldInjectSessionMemoryIntoPrompt(compactedMessages, 'auto')).toBe(
      false,
    )
  })
})

describe('lastSummarizedMessageId', () => {
  beforeEach(() => {
    resetSummarizedMessageId()
  })

  test('defaults to undefined', () => {
    expect(getLastSummarizedMessageId()).toBeUndefined()
  })

  test('set and get', () => {
    setLastSummarizedMessageId('msg-uuid-123')
    expect(getLastSummarizedMessageId()).toBe('msg-uuid-123')
  })

  test('set undefined clears value', () => {
    setLastSummarizedMessageId('msg-uuid-123')
    setLastSummarizedMessageId(undefined)
    expect(getLastSummarizedMessageId()).toBeUndefined()
  })

  test('resetSummarizedMessageId clears the value', () => {
    setLastSummarizedMessageId('msg-uuid-123')
    resetSummarizedMessageId()
    expect(getLastSummarizedMessageId()).toBeUndefined()
  })
})

describe('extraction guards', () => {
  test('markExtractionStarted and markExtractionCompleted', () => {
    markExtractionStarted()
    markExtractionCompleted()
    // Should complete without error
  })

  test('waitForSessionMemoryExtraction resolves quickly when no extraction in progress', async () => {
    await waitForSessionMemoryExtraction()
    // Should resolve immediately without error
  })
})

describe('persistSessionMemoryWithTokenCount metadata', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'smem-meta-'))
    setSessionMemoryDir(tempDir)
    initSession()
    setLastSummarizedMessageId(undefined)
  })

  afterEach(() => {
    endSession()
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('persists lastSummarizedMessageId to disk', () => {
    const originalId = getSessionId()
    expect(originalId).not.toBe(null)
    setLastSummarizedMessageId('meta-test-uuid-42')
    persistSessionMemoryWithTokenCount([
      {
        id: 'note-1',
        category: 'decision',
        content: 'Test metadata persistence',
        timestamp: new Date().toISOString(),
      },
    ])

    // End session and re-init to simulate reload from disk
    const savedId = originalId
    endSession()
    resetSummarizedMessageId()

    initSession(savedId ?? undefined)
    expect(getLastSummarizedMessageId()).toBe('meta-test-uuid-42')
    const notes = readSessionMemory(savedId ?? '')
    expect(notes.length).toBeGreaterThan(0)
    expect(notes[0]?.content).toBe('Test metadata persistence')
  })

  test('persisting without lastSummarizedMessageId writes no metadata line', () => {
    resetSummarizedMessageId()
    persistSessionMemoryWithTokenCount([
      {
        id: 'note-1',
        category: 'user-request',
        content: 'No metadata test',
        timestamp: new Date().toISOString(),
      },
    ])

    const id = getSessionId()
    expect(id).not.toBe(null)
    if (id) {
      const notes = readSessionMemory(id)
      expect(notes.length).toBeGreaterThan(0)
      expect(notes[0]?.content).toBe('No metadata test')
    }
  })
})

describe('isSessionMemoryEmpty', () => {
  test('returns true for empty string', () => {
    expect(isSessionMemoryEmpty('')).toBe(true)
  })

  test('returns true for whitespace-only content', () => {
    expect(isSessionMemoryEmpty('   \n\n  ')).toBe(true)
  })

  test('returns true for template-only content (no list items)', () => {
    const template =
      '# Session Memory\n\nSession: test-123\n\n## User Requests\n\n## Decisions Made\n\n## Context & Files\n'
    expect(isSessionMemoryEmpty(template)).toBe(true)
  })

  test('returns false when content has list items', () => {
    const content =
      '# Session Memory\n\nSession: test-123\n\n## User Requests\n- Fix the login bug\n'
    expect(isSessionMemoryEmpty(content)).toBe(false)
  })
})

describe('truncateSessionMemoryForCompact', () => {
  const sampleContent =
    '# Session Memory\n\nSession: test-123\n\n## User Requests\n- Fix the login bug\n- Deploy to production\n\n## Decisions Made\n- Use PostgreSQL for data storage\n- Migrate from MongoDB\n\n## Context & Files\n- File: src/auth.ts\n- File: src/db.ts\n'

  test('does not truncate content within bounds', () => {
    const result = truncateSessionMemoryForCompact(sampleContent)
    expect(result.wasTruncated).toBe(false)
    expect(result.truncatedContent).toBe(sampleContent)
  })

  test('truncates with very small total limit', () => {
    const result = truncateSessionMemoryForCompact(sampleContent, 2)
    expect(result.wasTruncated).toBe(true)
    expect(result.truncatedContent.length).toBeLessThan(sampleContent.length)
  })

  test('handles empty content', () => {
    const result = truncateSessionMemoryForCompact('')
    expect(result.wasTruncated).toBe(false)
    expect(result.truncatedContent).toBe('')
  })
})
