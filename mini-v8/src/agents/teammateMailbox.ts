import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const MAX_MAILBOX_MESSAGES = 100
const MAILBOX_COMPACT_TARGET = 50

export interface TeammateMessage {
  from: string
  text: string
  timestamp: string
  read: boolean
  color?: string
  summary?: string
}

let mailboxBaseDir: string | null = null

export function setMailboxBaseDir(path: string | null): void {
  mailboxBaseDir = path
}

function getTeamsDir(): string {
  if (mailboxBaseDir) return mailboxBaseDir
  return join(homedir(), '.claude', 'teams')
}

export function getInboxDir(teamName: string): string {
  const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(getTeamsDir(), safeName, 'inboxes')
}

export function getInboxPath(agentName: string, teamName: string): string {
  const safeName = agentName.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(getInboxDir(teamName), `${safeName}.json`)
}

export function ensureInboxDir(teamName: string): void {
  const dir = getInboxDir(teamName)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function writeToMailbox(
  recipientName: string,
  message: Omit<TeammateMessage, 'read'>,
  teamName: string,
): void {
  ensureInboxDir(teamName)
  const inboxPath = getInboxPath(recipientName, teamName)

  let messages: TeammateMessage[] = []
  if (existsSync(inboxPath)) {
    try {
      const data = readFileSync(inboxPath, 'utf-8')
      messages = JSON.parse(data) as TeammateMessage[]
    } catch {
      messages = []
    }
  }

  messages.push({
    from: message.from,
    text: message.text,
    timestamp: message.timestamp,
    read: false,
    color: message.color,
    summary: message.summary,
  })

  if (messages.length > MAX_MAILBOX_MESSAGES) {
    const unread = messages.filter(m => !m.read)
    const recent = messages.filter(m => m.read).slice(-MAILBOX_COMPACT_TARGET)
    messages = [...unread, ...recent]
  }

  writeFileSync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8')
}

export function readMailbox(
  agentName: string,
  teamName: string,
): TeammateMessage[] {
  const inboxPath = getInboxPath(agentName, teamName)
  if (!existsSync(inboxPath)) return []
  try {
    const data = readFileSync(inboxPath, 'utf-8')
    return JSON.parse(data) as TeammateMessage[]
  } catch {
    return []
  }
}

export function readUnreadMessages(
  agentName: string,
  teamName: string,
): TeammateMessage[] {
  return readMailbox(agentName, teamName).filter(m => !m.read)
}

export function markMessagesAsRead(
  agentName: string,
  teamName: string,
  indices: number[],
): void {
  const inboxPath = getInboxPath(agentName, teamName)
  if (!existsSync(inboxPath)) return
  try {
    const data = readFileSync(inboxPath, 'utf-8')
    const messages = JSON.parse(data) as TeammateMessage[]
    const readSet = new Set(indices)
    for (let i = 0; i < messages.length; i++) {
      if (readSet.has(i)) {
        messages[i].read = true
      }
    }
    writeFileSync(inboxPath, JSON.stringify(messages, null, 2), 'utf-8')
  } catch {
    /* ignore */
  }
}

export function compactMailbox(agentName: string, teamName: string): void {
  const inboxPath = getInboxPath(agentName, teamName)
  if (!existsSync(inboxPath)) return
  try {
    const data = readFileSync(inboxPath, 'utf-8')
    const messages = JSON.parse(data) as TeammateMessage[]
    if (messages.length <= MAILBOX_COMPACT_TARGET) return
    const unread = messages.filter(m => !m.read)
    const recent = messages.filter(m => m.read).slice(-MAILBOX_COMPACT_TARGET)
    const compacted = [...unread, ...recent]
    writeFileSync(inboxPath, JSON.stringify(compacted, null, 2), 'utf-8')
  } catch {
    /* ignore */
  }
}

export function initializeTeamMailboxes(
  teamName: string,
  memberNames: string[],
): void {
  ensureInboxDir(teamName)
  for (const name of memberNames) {
    const inboxPath = getInboxPath(name, teamName)
    if (!existsSync(inboxPath)) {
      writeFileSync(inboxPath, '[]', 'utf-8')
    }
  }
}

export function cleanupTeamMailboxes(teamName: string): void {
  const inboxDir = getInboxDir(teamName)
  if (existsSync(inboxDir)) {
    try {
      const files = readdirSync(inboxDir)
      for (const file of files) {
        unlinkSync(join(inboxDir, file))
      }
    } catch {
      /* ignore */
    }
  }
}

export function removeInboxFile(agentName: string, teamName: string): void {
  const inboxPath = getInboxPath(agentName, teamName)
  if (existsSync(inboxPath)) {
    try {
      unlinkSync(inboxPath)
    } catch {
      /* ignore */
    }
  }
}

export function isProtocolMessage(msg: TeammateMessage): boolean {
  try {
    const parsed = JSON.parse(msg.text)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.type === 'string'
    )
  } catch {
    return false
  }
}

export function parseProtocolMessage(
  msg: TeammateMessage,
): { type: string; payload: unknown } | null {
  try {
    const parsed = JSON.parse(msg.text) as Record<string, unknown>
    if (typeof parsed.type === 'string') {
      return { type: parsed.type, payload: parsed.payload }
    }
    return null
  } catch {
    return null
  }
}

export function sendProtocolMessage(
  recipientName: string,
  msg: { type: string; from: string; payload?: unknown },
  teamName: string,
): void {
  writeToMailbox(
    recipientName,
    {
      from: msg.from,
      text: JSON.stringify({ type: msg.type, payload: msg.payload }),
      timestamp: new Date().toISOString(),
    },
    teamName,
  )
}

export function sendIdleNotification(
  workerName: string,
  teamName: string,
  reason: 'available' | 'interrupted' | 'failed',
  summary: string,
): void {
  sendProtocolMessage(
    'team-lead',
    {
      type: 'idle_notification',
      from: workerName,
      payload: { reason, summary },
    },
    teamName,
  )
}

export function sendShutdownRequest(
  leaderName: string,
  workerName: string,
  teamName: string,
): void {
  sendProtocolMessage(
    workerName,
    { type: 'shutdown_request', from: leaderName },
    teamName,
  )
}

export function sendShutdownResponse(
  workerName: string,
  leaderName: string,
  teamName: string,
  accepted: boolean,
): void {
  sendProtocolMessage(
    leaderName,
    { type: 'shutdown_response', from: workerName, payload: { accepted } },
    teamName,
  )
}
