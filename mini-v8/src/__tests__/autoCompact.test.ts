import { describe, test, expect } from 'bun:test'
import {
  estimateTokens,
  needsCompaction,
  compactMessages,
  generateCompactionSummary,
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
    expect(compacted.length).toBe(5)
    expect(compacted[0].content).toBe('first')
    expect(compacted[compacted.length - 1].content).toBe('final')
    expect(compacted[compacted.length - 2].content).toBe('last')
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
    expect(compacted.length).toBe(7) // first + 6 (3 pairs * 2)
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
    const longContent = 'x'.repeat(200)
    const removed: BetaMessageParam[] = [{ role: 'user', content: longContent }]
    const summary = generateCompactionSummary(removed)
    expect(summary).not.toContain(longContent)
  })

  test('only includes first 5 user messages', () => {
    const removed: BetaMessageParam[] = []
    for (let i = 0; i < 10; i++) {
      removed.push({ role: 'user', content: `query${i}` })
      removed.push({ role: 'assistant', content: `response${i}` })
    }
    const summary = generateCompactionSummary(removed)
    expect(summary).toContain('query0')
    expect(summary).toContain('query4')
  })
})
