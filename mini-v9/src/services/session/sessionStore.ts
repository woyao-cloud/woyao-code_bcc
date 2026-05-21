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
