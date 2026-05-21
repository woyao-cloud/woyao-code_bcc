import { describe, test, expect, beforeEach } from 'bun:test'
import {
  enqueueNotification,
  drainNotifications,
  hasPendingNotifications,
  clearNotification,
  resetNotificationQueue,
  buildTaskNotificationXML,
} from '../services/notificationQueue.js'

const makeNotif = () => ({
  mode: 'task-notification' as const,
  priority: 'later' as const,
  taskId: 'task-001',
  toolUseId: 'toolu_001',
  agentId: 'agent-001',
  agentType: 'Explore',
  status: 'completed',
  summary: 'Agent completed search',
  result: 'Found 3 results',
  usage: { totalTokens: 1500, toolUses: 5, durationMs: 12000 },
})

describe('notificationQueue', () => {
  beforeEach(() => {
    resetNotificationQueue()
  })

  test('enqueue adds notification and returns id', () => {
    const id = enqueueNotification(makeNotif())
    expect(id).toBeDefined()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  test('enqueue sets id and createdAt', () => {
    const id = enqueueNotification(makeNotif())
    const drained = drainNotifications()
    expect(drained.length).toBe(1)
    expect(drained[0].id).toBe(id)
    expect(drained[0].createdAt).toBeGreaterThan(0)
  })

  test('drainNotifications returns and clears queue (no filter)', () => {
    enqueueNotification(makeNotif())
    enqueueNotification(makeNotif())

    const drained = drainNotifications()
    expect(drained.length).toBe(2)
    expect(hasPendingNotifications()).toBe(false)
  })

  test('drainNotifications with filter', () => {
    enqueueNotification({ ...makeNotif(), agentType: 'Explore', taskId: 't1' })
    enqueueNotification({ ...makeNotif(), agentType: 'Plan', taskId: 't2' })

    const exploreNotifs = drainNotifications(n => n.agentType === 'Explore')
    expect(exploreNotifs.length).toBe(1)
    expect(exploreNotifs[0].agentType).toBe('Explore')

    // Remaining should still be in queue
    expect(hasPendingNotifications()).toBe(true)
    const remaining = drainNotifications()
    expect(remaining.length).toBe(1)
    expect(remaining[0].agentType).toBe('Plan')
  })

  test('hasPendingNotifications returns correct state', () => {
    expect(hasPendingNotifications()).toBe(false)
    enqueueNotification(makeNotif())
    expect(hasPendingNotifications()).toBe(true)
    drainNotifications()
    expect(hasPendingNotifications()).toBe(false)
  })

  test('clearNotification removes by id', () => {
    const id1 = enqueueNotification(makeNotif())
    const id2 = enqueueNotification(makeNotif())

    clearNotification(id1)
    expect(hasPendingNotifications()).toBe(true)

    const remaining = drainNotifications()
    expect(remaining.length).toBe(1)
    expect(remaining[0].id).toBe(id2)
  })

  test('resetNotificationQueue clears all', () => {
    enqueueNotification(makeNotif())
    enqueueNotification(makeNotif())
    resetNotificationQueue()
    expect(hasPendingNotifications()).toBe(false)
  })
})

describe('buildTaskNotificationXML', () => {
  test('builds complete XML with all fields', () => {
    const notif = {
      id: 'n1',
      mode: 'task-notification' as const,
      priority: 'later' as const,
      taskId: 'abc-123',
      toolUseId: 'toolu_xxx',
      agentId: 'agent-001',
      agentType: 'Explore',
      status: 'completed',
      summary: 'Search complete',
      result: 'Found 15 files',
      usage: { totalTokens: 1500, toolUses: 8, durationMs: 12000 },
      createdAt: Date.now(),
    }

    const xml = buildTaskNotificationXML(notif)
    expect(xml).toContain('<task-notification>')
    expect(xml).toContain('<task-id>abc-123</task-id>')
    expect(xml).toContain('<tool-use-id>toolu_xxx</tool-use-id>')
    expect(xml).toContain('<agent-type>Explore</agent-type>')
    expect(xml).toContain('<status>completed</status>')
    expect(xml).toContain('<summary>Search complete</summary>')
    expect(xml).toContain('<result>Found 15 files</result>')
    expect(xml).toContain('<total_tokens>1500</total_tokens>')
    expect(xml).toContain('<tool_uses>8</tool_uses>')
    expect(xml).toContain('<duration_ms>12000</duration_ms>')
    expect(xml).toContain('</task-notification>')
  })

  test('omits optional fields when not provided', () => {
    const notif = {
      id: 'n1',
      mode: 'task-notification' as const,
      priority: 'later' as const,
      taskId: 't1',
      agentId: 'a1',
      agentType: 'Test',
      status: 'failed',
      summary: 'Failed',
      createdAt: Date.now(),
    }

    const xml = buildTaskNotificationXML(notif)
    expect(xml).not.toContain('<tool-use-id>')
    expect(xml).not.toContain('<result>')
    expect(xml).not.toContain('<usage>')
  })

  test('escapes XML special characters', () => {
    const notif = {
      id: 'n1',
      mode: 'task-notification' as const,
      priority: 'later' as const,
      taskId: 't1',
      agentId: 'a1',
      agentType: 'Test',
      status: 'completed',
      summary: 'a < b && b > c',
      result: '"quoted" & <escaped>',
      createdAt: Date.now(),
    }

    const xml = buildTaskNotificationXML(notif)
    expect(xml).not.toContain('&&')
    expect(xml).toContain('&amp;&amp;')
    expect(xml).toContain('&lt;')
    expect(xml).toContain('&gt;')
    expect(xml).toContain('&quot;')
  })
})
