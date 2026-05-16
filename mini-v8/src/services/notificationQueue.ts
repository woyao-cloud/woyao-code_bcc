import { randomUUID } from 'crypto'

export interface PendingNotification {
  id: string
  mode: 'task-notification'
  priority: 'now' | 'later'
  taskId: string
  toolUseId?: string
  agentId: string
  agentType: string
  status: string
  summary: string
  result?: string
  usage?: {
    totalTokens: number
    toolUses: number
    durationMs: number
  }
  createdAt: number
}

let notificationQueue: PendingNotification[] = []

export function enqueueNotification(
  n: Omit<PendingNotification, 'id' | 'createdAt'>,
): string {
  const id = randomUUID()
  notificationQueue.push({
    ...n,
    id,
    createdAt: Date.now(),
  })
  return id
}

export function drainNotifications(
  filter?: (n: PendingNotification) => boolean,
): PendingNotification[] {
  if (!filter) {
    const drained = notificationQueue
    notificationQueue = []
    return drained
  }

  const matched: PendingNotification[] = []
  const remaining: PendingNotification[] = []
  for (const n of notificationQueue) {
    if (filter(n)) {
      matched.push(n)
    } else {
      remaining.push(n)
    }
  }
  notificationQueue = remaining
  return matched
}

export function hasPendingNotifications(): boolean {
  return notificationQueue.length > 0
}

export function clearNotification(id: string): void {
  notificationQueue = notificationQueue.filter(n => n.id !== id)
}

export function resetNotificationQueue(): void {
  notificationQueue = []
}

export function buildTaskNotificationXML(notif: PendingNotification): string {
  const lines: string[] = ['<task-notification>']
  lines.push(`  <task-id>${escapeXml(notif.taskId)}</task-id>`)
  if (notif.toolUseId) {
    lines.push(`  <tool-use-id>${escapeXml(notif.toolUseId)}</tool-use-id>`)
  }
  lines.push(`  <agent-type>${escapeXml(notif.agentType)}</agent-type>`)
  lines.push(`  <status>${escapeXml(notif.status)}</status>`)
  lines.push(`  <summary>${escapeXml(notif.summary)}</summary>`)
  if (notif.result) {
    lines.push(`  <result>${escapeXml(notif.result)}</result>`)
  }
  if (notif.usage) {
    lines.push('  <usage>')
    lines.push(`    <total_tokens>${notif.usage.totalTokens}</total_tokens>`)
    lines.push(`    <tool_uses>${notif.usage.toolUses}</tool_uses>`)
    lines.push(`    <duration_ms>${notif.usage.durationMs}</duration_ms>`)
    lines.push('  </usage>')
  }
  lines.push('</task-notification>')
  return lines.join('\n')
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
