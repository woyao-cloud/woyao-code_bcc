import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ConversationBuffersSnapshot } from '../messages/apiProjection.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.js'

const SNAPSHOT_VERSION = 1
const DEFAULT_SESSION_STORE_DIR = join(
  homedir(),
  '.claude-code-mini',
  'sessions',
)

let sessionStoreDir = DEFAULT_SESSION_STORE_DIR

export interface PersistedSessionSnapshot {
  version: typeof SNAPSHOT_VERSION
  savedAt: string
  sessionId: string
  cwd: string
  model?: string
  conversation: ConversationBuffersSnapshot
}

export function setSessionStoreDir(dir: string | null): void {
  sessionStoreDir = dir && dir.trim() ? dir : DEFAULT_SESSION_STORE_DIR
  ensureSessionStoreDir()
}

export function saveConversationSnapshot(
  snapshot: Omit<PersistedSessionSnapshot, 'savedAt' | 'version'> & {
    savedAt?: string
  },
): PersistedSessionSnapshot | null {
  const path = getSessionSnapshotPath(snapshot.sessionId)
  if (!path || !ensureSessionStoreDir()) {
    return null
  }

  const normalized: PersistedSessionSnapshot = {
    version: SNAPSHOT_VERSION,
    savedAt: snapshot.savedAt ?? new Date().toISOString(),
    sessionId: snapshot.sessionId,
    cwd: snapshot.cwd,
    ...(snapshot.model ? { model: snapshot.model } : {}),
    conversation: snapshot.conversation,
  }

  try {
    writeFileSync(path, JSON.stringify(normalized, null, 2), 'utf-8')
    return normalized
  } catch {
    return null
  }
}

export function loadConversationSnapshot(
  sessionId: string,
): PersistedSessionSnapshot | null {
  const path = getSessionSnapshotPath(sessionId)
  if (!path || !existsSync(path)) {
    return null
  }

  try {
    return parsePersistedSessionSnapshot(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

export function loadLatestConversationSnapshot(): PersistedSessionSnapshot | null {
  if (!ensureSessionStoreDir()) {
    return null
  }

  const candidates = readdirSync(sessionStoreDir)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const path = join(sessionStoreDir, name)
      let mtimeMs = 0
      try {
        mtimeMs = statSync(path).mtimeMs
      } catch {}
      return { name, mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  for (const candidate of candidates) {
    try {
      const snapshot = parsePersistedSessionSnapshot(
        readFileSync(join(sessionStoreDir, candidate.name), 'utf-8'),
      )
      if (snapshot) {
        return snapshot
      }
    } catch {}
  }

  return null
}

function ensureSessionStoreDir(): boolean {
  if (existsSync(sessionStoreDir)) {
    return true
  }

  try {
    mkdirSync(sessionStoreDir, { recursive: true })
    return true
  } catch {
    return false
  }
}

function getSessionSnapshotPath(sessionId: string): string | null {
  const safeSessionId = sanitizeSessionId(sessionId)
  if (!safeSessionId) {
    return null
  }

  return join(sessionStoreDir, safeSessionId + '.json')
}

function sanitizeSessionId(sessionId: string): string | null {
  const normalized = sessionId.trim()
  if (!normalized) {
    return null
  }

  return /^[a-zA-Z0-9._-]+$/.test(normalized) ? normalized : null
}

function parsePersistedSessionSnapshot(
  raw: string,
): PersistedSessionSnapshot | null {
  const parsed = JSON.parse(raw) as Partial<PersistedSessionSnapshot>
  if (
    parsed.version !== SNAPSHOT_VERSION ||
    typeof parsed.savedAt !== 'string' ||
    typeof parsed.sessionId !== 'string' ||
    typeof parsed.cwd !== 'string' ||
    !isConversationBuffersSnapshot(parsed.conversation)
  ) {
    return null
  }

  return {
    version: SNAPSHOT_VERSION,
    savedAt: parsed.savedAt,
    sessionId: parsed.sessionId,
    cwd: parsed.cwd,
    ...(typeof parsed.model === 'string' ? { model: parsed.model } : {}),
    conversation: parsed.conversation,
  }
}

function isConversationBuffersSnapshot(
  value: unknown,
): value is ConversationBuffersSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const snapshot = value as Partial<ConversationBuffersSnapshot>
  return (
    typeof snapshot.forceCompactNextProjection === 'boolean' &&
    Array.isArray(snapshot.fullMessages) &&
    Array.isArray(snapshot.toolResultBudgetRecords) &&
    Array.isArray(snapshot.compactBoundaries)
  )
}

/**
 * Normalize messages loaded from a session snapshot.
 * Filters out corrupted or orphaned data that can accumulate during sessions:
 * - Orphaned tool_result blocks (no matching tool_use in the conversation)
 * - Messages with empty content
 * - Orphaned thinking blocks (no matching partner)
 */
export function normalizeMessages(
  messages: BetaMessageParam[],
): BetaMessageParam[] {
  // First pass: collect all tool_use IDs from assistant messages
  const toolUseIds = new Set<string>()
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    const content = Array.isArray(msg.content) ? msg.content : []
    for (const block of content) {
      if (block.type === 'tool_use') {
        toolUseIds.add(block.id)
      }
    }
  }

  // Preserved list with orphaned entries removed
  const preserved: Record<string, string[]> = {}
  for (const msg of messages) {
    if (msg.role !== 'user') continue
    const content = Array.isArray(msg.content) ? msg.content : []
    for (const block of content) {
      if (
        block.type === 'tool_result' &&
        block.tool_use_id &&
        !toolUseIds.has(block.tool_use_id)
      ) {
        // Track orphaned tool_result blocks by message index
        const key = messages.indexOf(msg).toString()
        if (!preserved[key]) preserved[key] = []
        preserved[key].push(block.tool_use_id)
      }
    }
  }

  const result: BetaMessageParam[] = []
  for (const msg of messages) {
    const content = Array.isArray(msg.content) ? msg.content : []

    // Filter out empty messages
    if (content.length === 0) {
      continue
    }
    if (
      content.length === 1 &&
      content[0].type === 'text' &&
      !content[0].text?.trim()
    ) {
      continue
    }

    // Filter orphaned tool_result and thinking blocks from this message
    const msgIndex = messages.indexOf(msg)
    const orphanedToolResultIds = preserved[msgIndex.toString()] ?? []
    const filteredContent = content.filter(block => {
      // Remove orphaned tool_result (no matching tool_use in conversation)
      if (
        block.type === 'tool_result' &&
        orphanedToolResultIds.includes(block.tool_use_id)
      ) {
        return false
      }
      return true
    })

    if (filteredContent.length > 0) {
      result.push({ ...msg, content: filteredContent } as BetaMessageParam)
    }
  }

  return result
}
