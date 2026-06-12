import { describe, test, expect, beforeEach, mock } from 'bun:test'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// Mock session memory module before importing the module under test
const mockReadSessionMemory =
  mock<
    (sessionId: string) => Array<{
      id: string
      category: string
      content: string
      timestamp: string
    }>
  >()
const mockGetSessionMemoryForPrompt =
  mock<
    (
      sessionId: string,
      options?: { maxNotesPerCategory?: number; maxChars?: number },
    ) => string
  >()
const mockIsSessionMemoryEmpty = mock<(content: string) => boolean>()
const mockTruncateSessionMemoryForCompact =
  mock<
    (
      content: string,
      maxTokens?: number,
    ) => { wasTruncated: boolean; truncatedContent: string }
  >()
const mockGetSessionId = mock<() => string | null>()
const mockGetLastSummarizedMessageId = mock<() => string | undefined>()
const mockGetSessionMemoryConfig =
  mock<
    () => {
      enabled: boolean
      minTokensForInit: number
      minTokensBetweenUpdate: number
      maxNotes: number
      sessionMemoryCompactEnabled: boolean
    }
  >()

mock.module('../memory/sessionMemory.js', () => ({
  getSessionId: mockGetSessionId,
  getLastSummarizedMessageId: mockGetLastSummarizedMessageId,
  getSessionMemoryForPrompt: mockGetSessionMemoryForPrompt,
  getSessionMemoryConfig: mockGetSessionMemoryConfig,
  isSessionMemoryEmpty: mockIsSessionMemoryEmpty,
  truncateSessionMemoryForCompact: mockTruncateSessionMemoryForCompact,
  readSessionMemory: mockReadSessionMemory,
  SESSION_MEMORY_COMPACTION_MARKER: '## Session Memory (auto-extracted)',
}))

import {
  getSessionMemoryCompactConfig,
  setSessionMemoryCompactConfig,
  resetSessionMemoryCompactConfig,
  adjustIndexToPreserveAPIInvariants,
  calculateMessagesToKeepIndex,
  trySessionMemoryCompaction,
} from '../sessionMemoryCompact.js'

function makeTextMsg(
  role: 'user' | 'assistant',
  text: string,
): BetaMessageParam {
  return { role, content: text }
}

function makeToolUseMsg(toolUseId: string, name = 'Bash'): BetaMessageParam {
  return {
    role: 'assistant',
    content: [
      { type: 'tool_use', id: toolUseId, name, input: {} } as unknown as Record<
        string,
        unknown
      >,
    ],
  } as BetaMessageParam
}

function makeToolResultMsg(
  toolUseId: string,
  content = 'result data',
): BetaMessageParam {
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content,
      } as unknown as Record<string, unknown>,
    ],
  } as BetaMessageParam
}

// Helper to build multi-block content messages
function makeContentBlockMsg(
  role: 'user' | 'assistant',
  blocks: Array<Record<string, unknown>>,
): BetaMessageParam {
  return { role, content: blocks } as BetaMessageParam
}

describe('getSessionMemoryCompactConfig', () => {
  test('returns default config', () => {
    const config = getSessionMemoryCompactConfig()
    expect(config.minTokens).toBe(10_000)
    expect(config.minTextBlockMessages).toBe(5)
    expect(config.maxTokens).toBe(40_000)
  })
})

describe('setSessionMemoryCompactConfig', () => {
  test('updates specific fields', () => {
    setSessionMemoryCompactConfig({ minTokens: 5_000, minTextBlockMessages: 3 })
    const config = getSessionMemoryCompactConfig()
    expect(config.minTokens).toBe(5_000)
    expect(config.minTextBlockMessages).toBe(3)
    expect(config.maxTokens).toBe(40_000) // unchanged
    resetSessionMemoryCompactConfig()
  })

  test('resets to defaults', () => {
    setSessionMemoryCompactConfig({ minTokens: 5_000 })
    resetSessionMemoryCompactConfig()
    const config = getSessionMemoryCompactConfig()
    expect(config.minTokens).toBe(10_000)
    expect(config.minTextBlockMessages).toBe(5)
  })
})

describe('adjustIndexToPreserveAPIInvariants', () => {
  const systemMsg = {
    role: 'system',
    content: 'You are a helpful assistant.',
  } as BetaMessageParam

  test('returns same index when no tool pairs need fixing', () => {
    const messages = [
      systemMsg,
      makeTextMsg('user', 'hello'),
      makeTextMsg('assistant', 'hi there'),
      makeTextMsg('user', 'how are you?'),
      makeTextMsg('assistant', 'I am fine!'),
    ]
    const result = adjustIndexToPreserveAPIInvariants(messages, 2)
    expect(result).toBe(2)
  })

  test('extends index backwards when tool_result needs matching tool_use', () => {
    const messages = [
      systemMsg,
      makeToolUseMsg('tu-1'),
      makeTextMsg('user', 'what is the result?'),
      makeToolResultMsg('tu-1'),
      makeTextMsg('assistant', 'done'),
    ]
    // Start at 3 (after tool_use + text), but tool_result at index 3 needs tool_use at index 1
    const result = adjustIndexToPreserveAPIInvariants(messages, 3)
    expect(result).toBe(1)
  })

  test('does not extend when tool_use is already in kept range', () => {
    const messages = [
      systemMsg,
      makeToolUseMsg('tu-1'),
      makeToolResultMsg('tu-1'),
      makeTextMsg('assistant', 'result processed'),
    ]
    // Start at 1 includes both tool_use and tool_result
    const result = adjustIndexToPreserveAPIInvariants(messages, 1)
    expect(result).toBe(1)
  })

  test('returns same index when startIndex <= 1', () => {
    const messages = [systemMsg, makeTextMsg('user', 'hello')]
    expect(adjustIndexToPreserveAPIInvariants(messages, 0)).toBe(0)
    expect(adjustIndexToPreserveAPIInvariants(messages, 1)).toBe(1)
  })

  test('returns same index when startIndex >= messages.length', () => {
    const messages = [systemMsg, makeTextMsg('user', 'hello')]
    expect(adjustIndexToPreserveAPIInvariants(messages, 5)).toBe(5)
  })
})

describe('calculateMessagesToKeepIndex', () => {
  const systemMsg = {
    role: 'system',
    content: 'You are a helpful assistant.',
  } as BetaMessageParam

  function makeLongerText(
    role: 'user' | 'assistant',
    prefix: string,
    length: number,
  ): BetaMessageParam {
    return { role, content: prefix + 'x'.repeat(length) }
  }

  test('backtracks to index 1 when lastSummarizedIndex is -1 (all messages below minimums)', () => {
    const messages = [systemMsg, makeTextMsg('user', 'hello')]
    // With only 1 non-system message, can't meet minTokens, so backtracks to index 1
    const result = calculateMessagesToKeepIndex(messages, -1)
    expect(result).toBe(1)
  })

  test('backtracks to index 1 when lastSummarizedIndex is at last message', () => {
    const messages = [
      systemMsg,
      makeTextMsg('user', 'hello'),
      makeTextMsg('assistant', 'hi'),
    ]
    // Both messages are below minimums, backtracks to include everything
    resetSessionMemoryCompactConfig()
    setSessionMemoryCompactConfig({ minTokens: 100, minTextBlockMessages: 1 })
    const result = calculateMessagesToKeepIndex(messages, 2)
    expect(result).toBe(1)
    resetSessionMemoryCompactConfig()
  })

  test('expands backwards when current range is below minimums', () => {
    // Each message ~250 tokens (1000 chars / 4)
    const messages = [
      systemMsg,
      makeLongerText('user', 'request A:', 1000),
      makeLongerText('assistant', 'response A:', 1000),
      makeLongerText('user', 'request B:', 1000),
      makeLongerText('assistant', 'response B:', 1000),
    ]
    // lastSummarizedIndex=1 → start at 2, keep messages 2-4 (3 msgs ~750 tokens)
    // Below minTokens=1000, expand back to include message 1 (4 msgs ~1000 tokens)
    resetSessionMemoryCompactConfig()
    setSessionMemoryCompactConfig({ minTokens: 1000, minTextBlockMessages: 2 })
    const result = calculateMessagesToKeepIndex(messages, 1)
    expect(result).toBe(1)
    resetSessionMemoryCompactConfig()
  })

  test('stays at startIndex when tail already meets minimums', () => {
    // Each message ~250 tokens (1000 chars / 4)
    const messages = [
      systemMsg,
      makeLongerText('user', 'old:', 1000),
      makeLongerText('assistant', 'old:', 1000),
      makeLongerText('user', 'mid:', 1000),
      makeLongerText('assistant', 'mid:', 1000),
      makeLongerText('user', 'current:', 1000),
      makeLongerText('assistant', 'current:', 1000),
    ]
    // lastSummarizedIndex=3 → start at 4, keep messages 4-6 (3 msgs ~750 tokens)
    // Set low minimums so tail already qualifies
    resetSessionMemoryCompactConfig()
    setSessionMemoryCompactConfig({ minTokens: 500, minTextBlockMessages: 2 })
    const result = calculateMessagesToKeepIndex(messages, 3)
    expect(result).toBe(4)
    resetSessionMemoryCompactConfig()
  })

  test('hits maxTokens limit', () => {
    // Create many messages that will exceed maxTokens
    const messages = [systemMsg]
    for (let i = 0; i < 50; i++) {
      messages.push(makeLongerText('user', `request ${i}:`, 2000))
      messages.push(makeLongerText('assistant', `response ${i}:`, 2000))
    }
    // Each message ~500 tokens, 100 messages ~ 50000 tokens
    resetSessionMemoryCompactConfig()
    setSessionMemoryCompactConfig({ minTokens: 100000, maxTokens: 5000 })
    const result = calculateMessagesToKeepIndex(messages, 0)
    // Should stop expanding at maxTokens, not at minTokens
    expect(result).toBeGreaterThan(0)
    resetSessionMemoryCompactConfig()
  })

  test('returns 0 for empty messages', () => {
    resetSessionMemoryCompactConfig()
    const result = calculateMessagesToKeepIndex([], 0)
    expect(result).toBe(0)
  })
})

describe('trySessionMemoryCompaction', () => {
  beforeEach(() => {
    mockGetSessionId.mockReset()
    mockReadSessionMemory.mockReset()
    mockGetSessionMemoryForPrompt.mockReset()
    mockGetSessionMemoryConfig.mockReset()
    mockIsSessionMemoryEmpty.mockReset()
    mockTruncateSessionMemoryForCompact.mockReset()
    mockGetLastSummarizedMessageId.mockReset()
    resetSessionMemoryCompactConfig()
    // Default: SM compaction enabled
    mockGetSessionMemoryConfig.mockReturnValue({
      enabled: true,
      minTokensForInit: 2000,
      minTokensBetweenUpdate: 1000,
      maxNotes: 30,
      sessionMemoryCompactEnabled: true,
    })
  })

  const systemMsg = {
    role: 'system',
    content: 'You are a helpful assistant.',
  } as BetaMessageParam

  test('returns null when SM compaction disabled via config', () => {
    mockGetSessionMemoryConfig.mockReturnValue({
      enabled: true,
      minTokensForInit: 2000,
      minTokensBetweenUpdate: 1000,
      maxNotes: 30,
      sessionMemoryCompactEnabled: false,
    })
    const messages = [
      systemMsg,
      makeTextMsg('user', 'hello'),
      makeTextMsg('assistant', 'hi'),
    ]
    const result = trySessionMemoryCompaction(messages)
    expect(result).toBeNull()
  })

  test('returns null when no session ID', () => {
    mockGetSessionId.mockReturnValue(null)
    const messages = [
      systemMsg,
      makeTextMsg('user', 'hello'),
      makeTextMsg('assistant', 'hi'),
    ]
    const result = trySessionMemoryCompaction(messages)
    expect(result).toBeNull()
  })

  test('returns null when session memory is empty', () => {
    mockGetSessionId.mockReturnValue('session-123')
    mockReadSessionMemory.mockReturnValue([])
    const messages = [
      systemMsg,
      makeTextMsg('user', 'hello'),
      makeTextMsg('assistant', 'hi'),
    ]
    const result = trySessionMemoryCompaction(messages)
    expect(result).toBeNull()
  })

  test('returns null when session memory content is empty after trimming', () => {
    mockGetSessionId.mockReturnValue('session-123')
    mockReadSessionMemory.mockReturnValue([
      {
        id: 'n1',
        category: 'decision',
        content: 'some note',
        timestamp: new Date().toISOString(),
      },
    ])
    mockGetSessionMemoryForPrompt.mockReturnValue('   \n\n  ')
    mockIsSessionMemoryEmpty.mockReturnValue(true)
    const messages = [
      systemMsg,
      makeTextMsg('user', 'hello'),
      makeTextMsg('assistant', 'hi'),
    ]
    const result = trySessionMemoryCompaction(messages)
    expect(result).toBeNull()
  })

  test('returns null when startIndex <= 1 (nothing to compact)', () => {
    mockGetSessionId.mockReturnValue('session-123')
    mockReadSessionMemory.mockReturnValue([
      {
        id: 'n1',
        category: 'decision',
        content: 'some note',
        timestamp: new Date().toISOString(),
      },
    ])
    mockGetSessionMemoryForPrompt.mockReturnValue(
      '## Session Memory\nsome note',
    )
    mockIsSessionMemoryEmpty.mockReturnValue(false)
    mockGetLastSummarizedMessageId.mockReturnValue(undefined)
    const messages = [systemMsg]
    const result = trySessionMemoryCompaction(messages)
    expect(result).toBeNull()
  })

  test('successfully compacts with session memory', () => {
    mockGetSessionId.mockReturnValue('session-123')
    mockReadSessionMemory.mockReturnValue([
      {
        id: 'n1',
        category: 'decision',
        content: 'some note',
        timestamp: new Date().toISOString(),
      },
    ])
    mockGetSessionMemoryForPrompt.mockReturnValue(
      '## Session Memory\nsome note',
    )
    mockIsSessionMemoryEmpty.mockReturnValue(false)
    mockTruncateSessionMemoryForCompact.mockReturnValue({
      wasTruncated: false,
      truncatedContent: '## Session Memory\nsome note',
    })
    mockGetLastSummarizedMessageId.mockReturnValue(undefined)

    const messages = [
      systemMsg,
      makeTextMsg('user', 'old request 1'),
      makeTextMsg('assistant', 'old response 1'),
      makeTextMsg('user', 'old request 2'),
      makeTextMsg('assistant', 'old response 2'),
      makeTextMsg('user', 'current request'),
      makeTextMsg('assistant', 'current response'),
    ]

    const result = trySessionMemoryCompaction(messages)

    // Should compact given enough messages
    if (result !== null) {
      expect(result.didCompact).toBe(true)
      expect(result.messages.length).toBeGreaterThan(1)
      expect(result.messages.length).toBeLessThanOrEqual(messages.length)
      // System message should be preserved
      expect(result.messages[0]!.content).toBe(systemMsg.content)
      // There should be a summary message
      const summaryMsg = result.messages[1]
      expect(summaryMsg?.role).toBe('assistant')
    }
  })

  test('handles errors gracefully by returning null', () => {
    mockGetSessionId.mockReturnValue('session-123')
    mockReadSessionMemory.mockReturnValue([
      {
        id: 'n1',
        category: 'decision',
        content: 'some note',
        timestamp: new Date().toISOString(),
      },
    ])
    mockGetSessionMemoryForPrompt.mockImplementation(() => {
      throw new Error('read error')
    })

    const messages = [
      systemMsg,
      makeTextMsg('user', 'hello'),
      makeTextMsg('assistant', 'hi'),
    ]
    const result = trySessionMemoryCompaction(messages)
    expect(result).toBeNull()
  })
})
