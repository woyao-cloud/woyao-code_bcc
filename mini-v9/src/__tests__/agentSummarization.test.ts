import { describe, expect, test } from 'bun:test'
import {
  buildAgentProgressSummary,
  formatSummaryForNotification,
  shouldSummarize,
  progressToSummaryString,
} from '../agents/agentSummarization.js'

describe('agentSummarization', () => {
  test('buildAgentProgressSummary creates summary with correct fields', () => {
    const summary = buildAgentProgressSummary(
      'agent-123',
      5,
      10000,
      8,
      ['Researched auth patterns', 'Found JWT implementation'],
    )
    expect(summary.agentId).toBe('agent-123')
    expect(summary.turnCount).toBe(5)
    expect(summary.totalTokens).toBe(10000)
    expect(summary.remainingContextPct).toBeGreaterThan(0)
    expect(summary.timestamp).toBeGreaterThan(0)
  })

  test('buildAgentProgressSummary with empty output', () => {
    const summary = buildAgentProgressSummary('agent-1', 1, 500, 0, [])
    expect(summary.summary).toBe('')
    expect(summary.turnCount).toBe(1)
  })

  test('buildAgentProgressSummary truncates long output', () => {
    const longOutput = ['A'.repeat(1000)]
    const summary = buildAgentProgressSummary(
      'agent-1', 10, 50000, 20, longOutput,
      { interval: 5, maxLength: 100 },
    )
    expect(summary.summary.length).toBeLessThanOrEqual(120)
  })

  test('formatSummaryForNotification returns formatted text', () => {
    const summary = buildAgentProgressSummary(
      'agent-1', 3, 1500, 2, ['Making progress'],
    )
    const text = formatSummaryForNotification(summary)
    expect(text).toContain('Turn 3')
    expect(text).toContain('1500 tokens')
    expect(text).toContain('Progress:')
  })

  test('shouldSummarize returns true at interval boundaries', () => {
    const config = { interval: 5, maxLength: 500 }
    expect(shouldSummarize(5, config)).toBe(true)
    expect(shouldSummarize(10, config)).toBe(true)
    expect(shouldSummarize(0, config)).toBe(false)
  })

  test('shouldSummarize returns false between intervals', () => {
    const config = { interval: 5, maxLength: 500 }
    expect(shouldSummarize(1, config)).toBe(false)
    expect(shouldSummarize(4, config)).toBe(false)
    expect(shouldSummarize(6, config)).toBe(false)
  })

  test('shouldSummarize uses default config when not provided', () => {
    expect(shouldSummarize(5)).toBe(true)
    expect(shouldSummarize(4)).toBe(false)
  })

  test('progressToSummaryString formats progress correctly', () => {
    const str = progressToSummaryString({
      turnCount: 7,
      totalTokens: 20000,
      toolUseCount: 12,
      lastActivity: Date.now(),
      summary: 'Completed phase 1',
    })
    expect(str).toContain('Turn 7')
    expect(str).toContain('20000 tokens')
    expect(str).toContain('12 tool uses')
    expect(str).toContain('Completed phase 1')
  })

  test('progressToSummaryString without summary', () => {
    const str = progressToSummaryString({
      turnCount: 1,
      totalTokens: 100,
      toolUseCount: 0,
      lastActivity: Date.now(),
    })
    expect(str).toContain('Turn 1')
  })
})
