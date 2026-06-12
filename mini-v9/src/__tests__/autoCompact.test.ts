import { describe, test, expect } from 'bun:test'
import {
  applyToolResultBudget,
  budgetToolResultOutputs,
  createToolResultBudgetState,
  estimateTokens,
  needsCompaction,
  compactMessages,
  generateCompactionSummary,
  microcompactToolResults,
  MICROCOMPACT_CLEAR_MESSAGE,
  reconstructToolResultBudgetState,
  serializeToolResultBudgetState,
  TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE,
} from '../services/compact/autoCompact.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

describe('estimateTokens', () => {
  test('returns 0 for empty array', () => {
    expect(estimateTokens([])).toBe(0)
  })

  test('estimates string content tokens', () => {
    const msgs: BetaMessageParam[] = [{ role: 'user', content: 'hello world' }]
    const tokens = estimateTokens(msgs)
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBe(Math.ceil('hello world'.length / 4))
  })

  test('estimates complex content tokens', () => {
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: [{ type: 'text', text: 'hello world' }] },
    ]
    expect(estimateTokens(msgs)).toBeGreaterThan(0)
  })

  test('sums multiple messages', () => {
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'msg2' },
      { role: 'user', content: 'msg3' },
    ]
    const tokens = estimateTokens(msgs)
    // 4 + 4 + 4 chars / 4 = 3 tokens
    expect(tokens).toBe(3)
  })
})

describe('needsCompaction', () => {
  test('returns false for empty messages', () => {
    expect(needsCompaction([])).toBe(false)
  })

  test('returns false for short messages', () => {
    const msgs: BetaMessageParam[] = [{ role: 'user', content: 'hi' }]
    expect(needsCompaction(msgs)).toBe(false)
  })

  test('returns true for very long messages', () => {
    const longText = 'a'.repeat(500_000)
    const msgs: BetaMessageParam[] = [{ role: 'user', content: longText }]
    expect(needsCompaction(msgs)).toBe(true)
  })

  test('uses model context window when provided', () => {
    const mediumText = 'a'.repeat(80_000 * 4)
    const msgs: BetaMessageParam[] = [{ role: 'user', content: mediumText }]
    expect(needsCompaction(msgs)).toBe(true)
    expect(needsCompaction(msgs, 'claude-opus-4-20250514')).toBe(false)
  })
})

describe('compactMessages', () => {
  test('returns same array when small', () => {
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ]
    const result = compactMessages(msgs)
    expect(result.length).toBe(2)
  })

  test('keeps first and last N messages', () => {
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: 'm1' },
      { role: 'assistant', content: 'r2' },
      { role: 'user', content: 'm2' },
      { role: 'assistant', content: 'r3' },
      { role: 'user', content: 'm3' },
      { role: 'assistant', content: 'r4' },
      { role: 'user', content: 'last' },
      { role: 'assistant', content: 'final' },
    ]

    const compacted = compactMessages(msgs, 2)
    expect(compacted.length).toBe(6)
    expect(compacted[0].content).toBe('first')
    expect(compacted[compacted.length - 1].content).toBe('final')
    expect(compacted[compacted.length - 2].content).toBe('last')
    expect(typeof compacted[1]?.content).toBe('string')
    expect(String(compacted[1]?.content)).toContain('Compacted')
  })

  test('returns all messages when count <= keepPairs*2', () => {
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ]
    expect(compactMessages(msgs, 3).length).toBe(4)
  })

  test('defaults to keepPairs=3', () => {
    const msgs: BetaMessageParam[] = []
    for (let i = 0; i < 20; i++) {
      msgs.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `msg${i}`,
      })
    }
    const compacted = compactMessages(msgs)
    expect(compacted.length).toBe(8) // first + summary + 6 (3 pairs * 2)
  })

  test('preserves tool_use and tool_result pairs in kept tail', () => {
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'initial' },
      { role: 'assistant', content: 'analysis 0' },
      { role: 'user', content: 'follow up 0' },
      { role: 'assistant', content: 'analysis 1' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_old',
            name: 'Read',
            input: { file_path: 'a.ts' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_old',
            content: 'old file contents',
          },
        ],
      },
      { role: 'assistant', content: 'final answer' },
    ]

    const compacted = compactMessages(msgs, 1)
    const serialized = JSON.stringify(compacted)
    expect(serialized).toContain('tu_old')
    expect(compacted.some(msg => Array.isArray(msg.content))).toBe(true)
  })

  test('prefers session memory summary when provided', () => {
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'initial' },
      { role: 'assistant', content: 'step 1' },
      { role: 'user', content: 'step 2' },
      { role: 'assistant', content: 'step 3' },
      { role: 'user', content: 'step 4' },
      { role: 'assistant', content: 'step 5' },
      { role: 'user', content: 'latest ask' },
      { role: 'assistant', content: 'latest answer' },
    ]

    const compacted = compactMessages(msgs, {
      keepPairs: 1,
      sessionMemorySummary:
        '## Session Memory (auto-extracted)\n\n### User Requests\n- Carry forward the auth migration plan',
    })

    expect(String(compacted[1]?.content)).toContain(
      'Earlier conversation summarized from session memory',
    )
    expect(String(compacted[1]?.content)).toContain(
      'Carry forward the auth migration plan',
    )
    expect(String(compacted[1]?.content)).not.toContain('messages covering')
  })
})

describe('generateCompactionSummary', () => {
  test('returns empty string for empty removed', () => {
    expect(generateCompactionSummary([])).toBe('')
  })

  test('includes removed message count', () => {
    const removed: BetaMessageParam[] = [
      { role: 'user', content: 'test query' },
      { role: 'assistant', content: 'test response' },
    ]
    const summary = generateCompactionSummary(removed)
    expect(summary).toContain('2 messages')
  })

  test('truncates long messages', () => {
    const longContent = 'x'.repeat(300)
    const removed: BetaMessageParam[] = [{ role: 'user', content: longContent }]
    const summary = generateCompactionSummary(removed)
    // intent slice is 200 chars, so 300-char content gets truncated
    expect(summary).toContain('xxx')
    expect(summary).not.toContain(longContent)
  })

  test('only includes last 4 user messages', () => {
    const removed: BetaMessageParam[] = []
    for (let i = 0; i < 10; i++) {
      removed.push({ role: 'user', content: `query${i}` })
      removed.push({ role: 'assistant', content: `response${i}` })
    }
    const summary = generateCompactionSummary(removed)
    // New summary uses slice(-4) for intents
    expect(summary).toContain('query6')
    expect(summary).toContain('query9')
    expect(summary).not.toContain('query0')
  })
})

describe('microcompactToolResults', () => {
  test('clears older compactable tool results and keeps recent ones', () => {
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'Read',
            input: { file_path: 'a.ts' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_1', content: 'content-1' },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_2',
            name: 'Grep',
            input: { pattern: 'x' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_2', content: 'content-2' },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_3',
            name: 'Bash',
            input: { command: 'pwd' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_3', content: 'content-3' },
        ],
      },
    ]

    const result = microcompactToolResults(msgs, {
      triggerThreshold: 2,
      keepRecent: 1,
    })
    const json = JSON.stringify(result)
    expect(json).toContain(MICROCOMPACT_CLEAR_MESSAGE)
    expect(json).toContain('content-3')
    expect(json).not.toContain('content-1')
    expect(json).not.toContain('content-2')
  })

  test('does not clear error tool results', () => {
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'Read',
            input: { file_path: 'a.ts' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_1',
            content: 'error payload',
            is_error: true,
          },
        ],
      },
    ]

    const result = microcompactToolResults(msgs, {
      triggerThreshold: 0,
      keepRecent: 0,
    })
    expect(JSON.stringify(result)).toContain('error payload')
  })
})

describe('budgetToolResultOutputs', () => {
  test('replaces oversized compactable tool results with deterministic previews', () => {
    const hugeOutput = 'abcdef '.repeat(900)
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'Read',
            input: { file_path: 'a.ts' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_1', content: hugeOutput },
        ],
      },
    ]

    const result = budgetToolResultOutputs(msgs, {
      maxTokensPerResult: 200,
      maxPreviewChars: 120,
    })
    const json = JSON.stringify(result)
    expect(json).toContain(TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE)
    expect(json).not.toContain(hugeOutput)
    expect(JSON.stringify(msgs)).toContain(hugeOutput)
  })

  test('keeps error tool results untouched', () => {
    const hugeOutput = 'error '.repeat(800)
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'Read',
            input: { file_path: 'a.ts' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_1',
            content: hugeOutput,
            is_error: true,
          },
        ],
      },
    ]

    const result = budgetToolResultOutputs(msgs, {
      maxTokensPerResult: 100,
    })
    expect(JSON.stringify(result)).toContain(hugeOutput)
  })

  test('freezes previously seen unreplaced results against later stricter budgets', () => {
    const mediumOutput = 'abcdef '.repeat(120)
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'Read',
            input: { file_path: 'a.ts' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_1', content: mediumOutput },
        ],
      },
    ]
    const state = createToolResultBudgetState()

    const first = applyToolResultBudget(msgs, state, {
      maxTokensPerMessage: 10_000,
      maxTokensPerResult: 10_000,
    })
    const second = applyToolResultBudget(msgs, state, {
      maxTokensPerMessage: 20,
      maxTokensPerResult: 20,
    })

    expect(first.didBudgetToolResults).toBe(false)
    expect(state.seenToolUseIds.has('tu_1')).toBe(true)
    expect(state.replacements.size).toBe(0)
    expect(second.didBudgetToolResults).toBe(false)
    expect(JSON.stringify(second.messages)).toContain(mediumOutput)
  })

  test('reconstructs replacement state and replays stored previews', () => {
    const hugeOutput = 'abcdef '.repeat(900)
    const msgs: BetaMessageParam[] = [
      { role: 'user', content: 'start' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'Read',
            input: { file_path: 'a.ts' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tu_1', content: hugeOutput },
        ],
      },
    ]
    const originalState = createToolResultBudgetState()
    const first = applyToolResultBudget(msgs, originalState, {
      maxTokensPerResult: 100,
      maxPreviewChars: 100,
    })
    const records = serializeToolResultBudgetState(originalState)
    const restoredState = reconstructToolResultBudgetState(msgs, records)
    const replay = applyToolResultBudget(msgs, restoredState, {
      maxTokensPerResult: 100,
      maxPreviewChars: 100,
    })

    expect(first.didBudgetToolResults).toBe(true)
    expect(records.length).toBe(1)
    expect(replay.didBudgetToolResults).toBe(true)
    const replayContent = replay.messages[2]
    expect(Array.isArray(replayContent?.content)).toBe(true)
    const replayBlock = Array.isArray(replayContent?.content)
      ? replayContent.content[0]
      : undefined
    expect(
      typeof replayBlock === 'object' &&
        replayBlock !== null &&
        'content' in replayBlock
        ? replayBlock.content
        : undefined,
    ).toBe(records[0]?.replacement)
  })
})
