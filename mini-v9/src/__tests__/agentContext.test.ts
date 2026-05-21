// ============================================================
// Agent Context (ALS) Tests for mini-v8
// ============================================================

import { describe, test, expect } from 'bun:test'
import {
  runWithAgentContext,
  getAgentContext,
  isInAgentContext,
  isAsyncAgent,
  isSubagentContext,
  isTeammateContext,
  getCurrentAgentId,
  getAgentLogPrefix,
  createSubagentContext,
  createTeammateContext,
} from '../utils/agentContext.js'
import type { SubagentContext, TeammateContext } from '../utils/agentContext.js'

// ============================================================
// getAgentContext — outside any context
// ============================================================

describe('getAgentContext outside context', () => {
  test('returns undefined when not in agent context', () => {
    expect(getAgentContext()).toBeUndefined()
  })

  test('isInAgentContext returns false', () => {
    expect(isInAgentContext()).toBe(false)
  })

  test('isAsyncAgent returns false', () => {
    expect(isAsyncAgent()).toBe(false)
  })

  test('getCurrentAgentId returns undefined', () => {
    expect(getCurrentAgentId()).toBeUndefined()
  })

  test('getAgentLogPrefix returns [main]', () => {
    expect(getAgentLogPrefix()).toBe('[main]')
  })
})

// ============================================================
// getAgentContext — inside subagent context
// ============================================================

describe('getAgentContext inside subagent context', () => {
  test('returns context within runWithAgentContext', async () => {
    const ctx = createSubagentContext({
      agentId: 'agent-001',
      agentType: 'Explore',
      isAsync: false,
    })

    const result = await runWithAgentContext(ctx, async () => {
      return getAgentContext()
    })

    expect(result).toBeDefined()
    expect(result!.agentId).toBe('agent-001')
    expect(result!.agentType).toBe('Explore')
    expect(isSubagentContext(result!)).toBe(true)
    expect(isTeammateContext(result!)).toBe(false)
  })

  test('isInAgentContext returns true inside context', async () => {
    const ctx = createSubagentContext({
      agentId: 'agent-002',
      agentType: 'Plan',
      isAsync: true,
    })

    await runWithAgentContext(ctx, async () => {
      expect(isInAgentContext()).toBe(true)
    })
  })

  test('isAsyncAgent reflects isAsync flag', async () => {
    const asyncCtx = createSubagentContext({
      agentId: 'agent-003',
      agentType: 'worker',
      isAsync: true,
    })
    await runWithAgentContext(asyncCtx, async () => {
      expect(isAsyncAgent()).toBe(true)
    })

    const syncCtx = createSubagentContext({
      agentId: 'agent-004',
      agentType: 'Explore',
      isAsync: false,
    })
    await runWithAgentContext(syncCtx, async () => {
      expect(isAsyncAgent()).toBe(false)
    })
  })

  test('getCurrentAgentId returns agent ID', async () => {
    const ctx = createSubagentContext({
      agentId: 'agent-id-xyz',
      agentType: 'general-purpose',
      isAsync: false,
    })

    await runWithAgentContext(ctx, async () => {
      expect(getCurrentAgentId()).toBe('agent-id-xyz')
    })
  })

  test('context is not accessible after runWithAgentContext completes', async () => {
    const ctx = createSubagentContext({
      agentId: 'agent-005',
      agentType: 'Explore',
      isAsync: false,
    })

    await runWithAgentContext(ctx, async () => {
      expect(getAgentContext()).toBeDefined()
    })

    // After the async block completes, context should be cleared
    expect(getAgentContext()).toBeUndefined()
  })
})

// ============================================================
// ALS nesting — concurrent agents don't leak context
// ============================================================

describe('ALS nesting and concurrency', () => {
  test('nested contexts preserve parent context after child completes', async () => {
    const parentCtx = createSubagentContext({
      agentId: 'parent-001',
      agentType: 'general-purpose',
      isAsync: false,
    })

    const childCtx = createSubagentContext({
      agentId: 'child-001',
      agentType: 'Explore',
      isAsync: false,
    })

    await runWithAgentContext(parentCtx, async () => {
      expect(getCurrentAgentId()).toBe('parent-001')

      await runWithAgentContext(childCtx, async () => {
        // Inside child, we see child context
        expect(getCurrentAgentId()).toBe('child-001')
        expect(getAgentContext()!.agentType).toBe('Explore')
      })

      // After child completes, parent context is restored
      expect(getCurrentAgentId()).toBe('parent-001')
      expect(getAgentContext()!.agentType).toBe('general-purpose')
    })
  })

  test('concurrent async agents do not interfere', async () => {
    const ctxA = createSubagentContext({
      agentId: 'concurrent-A',
      agentType: 'Explore',
      isAsync: true,
    })
    const ctxB = createSubagentContext({
      agentId: 'concurrent-B',
      agentType: 'Plan',
      isAsync: true,
    })

    const promiseA = runWithAgentContext(ctxA, async () => {
      // Simulate some async work
      await new Promise(r => setTimeout(r, 10))
      return getCurrentAgentId()
    })

    const promiseB = runWithAgentContext(ctxB, async () => {
      await new Promise(r => setTimeout(r, 5))
      return getCurrentAgentId()
    })

    const [resultA, resultB] = await Promise.all([promiseA, promiseB])
    expect(resultA).toBe('concurrent-A')
    expect(resultB).toBe('concurrent-B')
  })

  test('parentAgentId is set from current context', async () => {
    const parentCtx = createSubagentContext({
      agentId: 'p-001',
      agentType: 'coordinator',
      isAsync: false,
    })

    await runWithAgentContext(parentCtx, async () => {
      const childCtx = createSubagentContext({
        agentId: 'w-001',
        agentType: 'worker',
        isAsync: true,
      })

      // Child should inherit parentAgentId from the active context
      expect(childCtx.parentAgentId).toBe('p-001')
    })
  })

  test('parentAgentId is undefined when no parent context exists', () => {
    const ctx = createSubagentContext({
      agentId: 'top-level',
      agentType: 'general-purpose',
      isAsync: false,
    })
    expect(ctx.parentAgentId).toBeUndefined()
  })
})

// ============================================================
// getAgentLogPrefix
// ============================================================

describe('getAgentLogPrefix', () => {
  test('shows [main] outside context', () => {
    expect(getAgentLogPrefix()).toBe('[main]')
  })

  test('shows agent type and truncated ID', async () => {
    const ctx = createSubagentContext({
      agentId: 'abcdefgh-1234-5678-9012-abcdefghijkl',
      agentType: 'Explore',
      isAsync: false,
    })

    await runWithAgentContext(ctx, async () => {
      expect(getAgentLogPrefix()).toBe('[Explore:abcdefgh]')
    })
  })

  test('shows team name when present', async () => {
    const ctx = createSubagentContext({
      agentId: 'bbbbbbbb-1234-5678-9012-bbbbbbbbbbbb',
      agentType: 'worker',
      teamName: 'swarm-1',
      isAsync: true,
    })

    await runWithAgentContext(ctx, async () => {
      expect(getAgentLogPrefix()).toBe('[swarm-1/worker:bbbbbbbb]')
    })
  })
})

// ============================================================
// createTeammateContext
// ============================================================

describe('createTeammateContext', () => {
  test('creates teammate context with all fields', () => {
    const ctx = createTeammateContext({
      agentId: 'tm-001',
      agentName: 'builder-1',
      agentType: 'general-purpose',
      teamName: 'build-squad',
      agentColor: '#D77757',
      isAsync: true,
      isTeamLead: false,
    })

    expect(ctx.agentId).toBe('tm-001')
    expect(ctx.agentName).toBe('builder-1')
    expect(ctx.agentType).toBe('general-purpose')
    expect(ctx.teamName).toBe('build-squad')
    expect(ctx.agentColor).toBe('#D77757')
    expect(ctx.isAsync).toBe(true)
    expect(ctx.isTeamLead).toBe(false)
    expect(ctx.startTime).toBeGreaterThan(0)
  })

  test('isTeammateContext type guard works', async () => {
    const ctx = createTeammateContext({
      agentId: 'tm-002',
      agentName: 'reviewer',
      agentType: 'Verify',
      teamName: 'review-squad',
      isAsync: false,
    })

    await runWithAgentContext(ctx, async () => {
      const current = getAgentContext()
      expect(isTeammateContext(current)).toBe(true)
      expect(isSubagentContext(current)).toBe(false)
    })
  })
})

// ============================================================
// Error handling
// ============================================================

describe('ALS error handling', () => {
  test('context is cleared after function throws', async () => {
    const ctx = createSubagentContext({
      agentId: 'err-agent',
      agentType: 'Explore',
      isAsync: false,
    })

    try {
      await runWithAgentContext(ctx, async () => {
        expect(getCurrentAgentId()).toBe('err-agent')
        throw new Error('test failure')
      })
    } catch {
      // Expected
    }

    // Context should be cleared even after error
    expect(getAgentContext()).toBeUndefined()
    expect(isInAgentContext()).toBe(false)
  })
})
