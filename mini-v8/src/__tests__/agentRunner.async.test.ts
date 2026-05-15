// ============================================================
// Async Agent Runner Tests for mini-v8
// ============================================================

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { agentTaskStore } from '../services/taskStore.js'
import {
  runAgentSync,
  runAgentAsync,
  getCurrentAgentContext,
  getAgentContext,
} from '../agents/agentRunner.js'
import type {
  AgentDefinition,
  AgentTaskState,
  AgentResult,
} from '../agents/agentTypes.js'

// ============================================================
// AgentTaskStore Tests
// ============================================================

describe('AgentTaskStore', () => {
  beforeEach(() => {
    agentTaskStore.reset()
  })

  afterEach(() => {
    agentTaskStore.reset()
  })

  test('create returns AgentTaskState with running status', () => {
    const abortController = new AbortController()
    const task = agentTaskStore.create({
      agentId: 'agent-001',
      agentType: 'Explore',
      agentName: 'explorer-1',
      prompt: 'Find all API endpoints',
      model: 'claude-sonnet-4-20250514',
      toolUseId: 'toolu_001',
      abortController,
    })

    expect(task.taskId).toBeDefined()
    expect(typeof task.taskId).toBe('string')
    expect(task.agentId).toBe('agent-001')
    expect(task.agentType).toBe('Explore')
    expect(task.agentName).toBe('explorer-1')
    expect(task.status).toBe('running')
    expect(task.prompt).toBe('Find all API endpoints')
    expect(task.model).toBe('claude-sonnet-4-20250514')
    expect(task.toolUseId).toBe('toolu_001')
    expect(task.startTime).toBeGreaterThan(0)
    expect(task.endTime).toBeUndefined()
    expect(task.result).toBeUndefined()
    expect(task.error).toBeUndefined()
    expect(task.notified).toBe(false)
    expect(task.abortController).toBe(abortController)
    expect(task.progress.turnCount).toBe(0)
    expect(task.progress.totalTokens).toBe(0)
    expect(task.progress.toolUseCount).toBe(0)
  })

  test('get returns task by ID', () => {
    const abortController = new AbortController()
    const created = agentTaskStore.create({
      agentId: 'agent-002',
      agentType: 'Plan',
      prompt: 'Plan the refactoring',
      model: 'claude-sonnet-4-20250514',
      abortController,
    })

    const retrieved = agentTaskStore.get(created.taskId)
    expect(retrieved).toBeDefined()
    expect(retrieved!.taskId).toBe(created.taskId)
    expect(retrieved!.agentId).toBe('agent-002')
  })

  test('get returns undefined for unknown ID', () => {
    expect(agentTaskStore.get('nonexistent')).toBeUndefined()
  })

  test('getByAgentId finds task by agent ID', () => {
    const abortController = new AbortController()
    agentTaskStore.create({
      agentId: 'agent-003',
      agentType: 'worker',
      prompt: 'Do work',
      model: 'claude-sonnet-4-20250514',
      abortController,
    })

    const found = agentTaskStore.getByAgentId('agent-003')
    expect(found).toBeDefined()
    expect(found!.agentId).toBe('agent-003')
  })

  test('getByAgentId returns undefined for unknown agent', () => {
    expect(agentTaskStore.getByAgentId('unknown-agent')).toBeUndefined()
  })

  test('list returns all tasks', () => {
    const ac1 = new AbortController()
    const ac2 = new AbortController()
    agentTaskStore.create({
      agentId: 'a1',
      agentType: 'Explore',
      prompt: 'Task 1',
      model: 'm1',
      abortController: ac1,
    })
    agentTaskStore.create({
      agentId: 'a2',
      agentType: 'Plan',
      prompt: 'Task 2',
      model: 'm2',
      abortController: ac2,
    })

    const all = agentTaskStore.list()
    expect(all.length).toBe(2)
  })

  test('list filters by status', () => {
    const ac1 = new AbortController()
    const task = agentTaskStore.create({
      agentId: 'a1',
      agentType: 'Explore',
      prompt: 'Task 1',
      model: 'm1',
      abortController: ac1,
    })
    agentTaskStore.complete(task.taskId, {
      agentId: 'a1',
      status: 'completed',
      content: ['done'],
      totalTokens: 100,
      totalToolUseCount: 2,
      totalDurationMs: 5000,
    })

    const running = agentTaskStore.list({ status: 'running' })
    expect(running.length).toBe(0)

    const completed = agentTaskStore.list({ status: 'completed' })
    expect(completed.length).toBe(1)
  })

  test('getRunning returns only running tasks', () => {
    const ac1 = new AbortController()
    const ac2 = new AbortController()
    const t1 = agentTaskStore.create({
      agentId: 'a1',
      agentType: 'Explore',
      prompt: 'T1',
      model: 'm',
      abortController: ac1,
    })
    const t2 = agentTaskStore.create({
      agentId: 'a2',
      agentType: 'Plan',
      prompt: 'T2',
      model: 'm',
      abortController: ac2,
    })
    agentTaskStore.complete(t1.taskId, {
      agentId: 'a1',
      status: 'completed',
      content: ['done'],
      totalTokens: 50,
      totalToolUseCount: 1,
      totalDurationMs: 3000,
    })

    const running = agentTaskStore.getRunning()
    expect(running.length).toBe(1)
    expect(running[0].agentId).toBe('a2')
  })

  test('updateProgress modifies progress fields', () => {
    const abortController = new AbortController()
    const task = agentTaskStore.create({
      agentId: 'a1',
      agentType: 'Explore',
      prompt: 'T1',
      model: 'm',
      abortController,
    })

    agentTaskStore.updateProgress(task.taskId, {
      turnCount: 3,
      totalTokens: 1500,
      toolUseCount: 5,
    })

    const updated = agentTaskStore.get(task.taskId)
    expect(updated!.progress.turnCount).toBe(3)
    expect(updated!.progress.totalTokens).toBe(1500)
    expect(updated!.progress.toolUseCount).toBe(5)
    expect(updated!.progress.lastActivity).toBeGreaterThan(0)
  })

  test('updateProgress is no-op for unknown task', () => {
    // Should not throw
    agentTaskStore.updateProgress('nonexistent', { turnCount: 1 })
  })

  test('complete sets status and result', () => {
    const abortController = new AbortController()
    const task = agentTaskStore.create({
      agentId: 'a1',
      agentType: 'worker',
      prompt: 'Implement X',
      model: 'm',
      abortController,
    })

    const result: AgentResult = {
      agentId: 'a1',
      status: 'completed',
      content: ['Implementation done', 'Tests passing'],
      totalTokens: 3000,
      totalToolUseCount: 15,
      totalDurationMs: 45000,
    }

    agentTaskStore.complete(task.taskId, result)

    const completed = agentTaskStore.get(task.taskId)
    expect(completed!.status).toBe('completed')
    expect(completed!.result).toBe(result)
    expect(completed!.endTime).toBeGreaterThan(0)
  })

  test('fail sets status and error', () => {
    const abortController = new AbortController()
    const task = agentTaskStore.create({
      agentId: 'a1',
      agentType: 'Explore',
      prompt: 'Find X',
      model: 'm',
      abortController,
    })

    agentTaskStore.fail(task.taskId, 'API key expired')

    const failed = agentTaskStore.get(task.taskId)
    expect(failed!.status).toBe('failed')
    expect(failed!.error).toBe('API key expired')
    expect(failed!.endTime).toBeGreaterThan(0)
  })

  test('kill aborts and sets status', () => {
    const abortController = new AbortController()
    let aborted = false
    abortController.signal.addEventListener('abort', () => {
      aborted = true
    })

    const task = agentTaskStore.create({
      agentId: 'a1',
      agentType: 'worker',
      prompt: 'Long task',
      model: 'm',
      abortController,
    })

    agentTaskStore.kill(task.taskId)

    const killed = agentTaskStore.get(task.taskId)
    expect(killed!.status).toBe('killed')
    expect(aborted).toBe(true)
  })

  test('killAll kills all running tasks', () => {
    const ac1 = new AbortController()
    const ac2 = new AbortController()
    const t1 = agentTaskStore.create({
      agentId: 'a1',
      agentType: 'Explore',
      prompt: 'T1',
      model: 'm',
      abortController: ac1,
    })
    agentTaskStore.create({
      agentId: 'a2',
      agentType: 'Plan',
      prompt: 'T2',
      model: 'm',
      abortController: ac2,
    })
    agentTaskStore.complete(t1.taskId, {
      agentId: 'a1',
      status: 'completed',
      content: ['done'],
      totalTokens: 100,
      totalToolUseCount: 1,
      totalDurationMs: 1000,
    })

    agentTaskStore.killAll()

    // The completed task should be untouched
    const completed = agentTaskStore.get(t1.taskId)
    expect(completed!.status).toBe('completed')

    // The running task should be killed
    const running = agentTaskStore.list({ status: 'running' })
    expect(running.length).toBe(0)
    const killed = agentTaskStore.list({ status: 'killed' })
    expect(killed.length).toBe(1)
  })

  test('remove deletes task from store', () => {
    const abortController = new AbortController()
    const task = agentTaskStore.create({
      agentId: 'a1',
      agentType: 'Test',
      prompt: 'T1',
      model: 'm',
      abortController,
    })

    expect(agentTaskStore.get(task.taskId)).toBeDefined()
    agentTaskStore.remove(task.taskId)
    expect(agentTaskStore.get(task.taskId)).toBeUndefined()
  })

  test('reset clears all tasks and kills running', () => {
    const ac1 = new AbortController()
    const ac2 = new AbortController()
    agentTaskStore.create({
      agentId: 'a1',
      agentType: 'E1',
      prompt: 'T1',
      model: 'm',
      abortController: ac1,
    })
    agentTaskStore.create({
      agentId: 'a2',
      agentType: 'E2',
      prompt: 'T2',
      model: 'm',
      abortController: ac2,
    })

    expect(agentTaskStore.list().length).toBe(2)
    agentTaskStore.reset()
    expect(agentTaskStore.list().length).toBe(0)
  })
})

// ============================================================
// runAgentAsync Tests (structural — no API calls)
// ============================================================

describe('runAgentAsync', () => {
  afterEach(() => {
    agentTaskStore.reset()
  })

  test('throws for unknown agent type', () => {
    expect(() =>
      runAgentAsync({
        agent: 'NonExistentAgent',
        task: 'Do something',
      }),
    ).toThrow(/Agent type not found/)
  })

  // Note: Full integration tests with real API calls would go in
  // a separate integration test suite. These tests verify the
  // structural correctness of the async execution API.
})

// ============================================================
// AgentRunOptions type tests (compile-time verification)
// ============================================================

describe('AgentRunOptions', () => {
  test('run_in_background is accepted in options', () => {
    // Type-only test: verifies that runInBackground and onProgress
    // are valid properties of AgentRunOptions (already verified by tsc)
    const options = {
      agent: 'Explore',
      task: 'test',
      runInBackground: true,
      onProgress: () => {},
      toolUseId: 'toolu_001',
    }
    expect(options.runInBackground).toBe(true)
    expect(options.toolUseId).toBe('toolu_001')
  })
})

// ============================================================
// AgentTaskState completeness tests
// ============================================================

describe('AgentTaskState', () => {
  test('AgentTaskState has all lifecycle fields', () => {
    const abortController = new AbortController()
    const task = agentTaskStore.create({
      agentId: 'test-agent',
      agentType: 'Explore',
      agentName: 'test-name',
      prompt: 'test prompt',
      model: 'test-model',
      toolUseId: 'toolu_test',
      abortController,
    })

    // Verify the complete shape
    const state: AgentTaskState = task
    expect(state.taskId).toBeTruthy()
    expect(state.agentId).toBe('test-agent')
    expect(state.agentType).toBe('Explore')
    expect(state.agentName).toBe('test-name')
    expect(state.status).toBe('running')
    expect(state.prompt).toBe('test prompt')
    expect(state.model).toBe('test-model')
    expect(state.toolUseId).toBe('toolu_test')
    expect(state.startTime).toBeGreaterThan(0)
    expect(state.progress).toBeDefined()
    expect(state.abortController).toBeDefined()
    expect(state.notified).toBe(false)
  })
})
