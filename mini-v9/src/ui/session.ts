import { existsSync } from 'fs'
import type { PersistedSessionSnapshot as _PersistedSessionSnapshot } from '../services/session/sessionStore.js'
export type PersistedSessionSnapshot = _PersistedSessionSnapshot
import {
  loadConversationSnapshot,
  loadLatestConversationSnapshot,
  saveConversationSnapshot,
  normalizeMessages,
} from '../services/session/sessionStore.js'
import { getSessionId } from '../services/memory/sessionMemory.js'
import { getCwd, setCwd } from '../bootstrap/state.js'
import { resolveModel } from '../utils/model/model.js'
import {
  createConversationBuffers,
  serializeConversationBuffers,
  restoreLastSummarizedMessageIdFromBoundaries,
  type ConversationBuffers,
} from '../services/messages/apiProjection.js'

export interface ParsedCLIArgs {
  promptArgs: string[]
  resumeRequested: boolean
  resumeSessionId?: string
}

export function parseCLIArgs(rawArgs: string[]): ParsedCLIArgs {
  const promptArgs: string[] = []
  let resumeRequested = false
  let resumeSessionId: string | undefined

  for (const arg of rawArgs) {
    if (arg === '--resume') {
      resumeRequested = true
      continue
    }
    if (arg.startsWith('--resume=')) {
      resumeRequested = true
      const explicitSessionId = arg.slice('--resume='.length).trim()
      if (explicitSessionId) {
        resumeSessionId = explicitSessionId
      }
      continue
    }
    promptArgs.push(arg)
  }

  return {
    promptArgs,
    resumeRequested,
    ...(resumeSessionId ? { resumeSessionId } : {}),
  }
}

export function resolveResumeSnapshot(
  args: ParsedCLIArgs,
): PersistedSessionSnapshot | null {
  if (!args.resumeRequested) return null
  if (args.resumeSessionId) return loadConversationSnapshot(args.resumeSessionId)
  return loadLatestConversationSnapshot()
}

export function restoreSnapshotCwd(
  snapshot: PersistedSessionSnapshot | null,
): boolean {
  const snapshotCwd = snapshot?.cwd?.trim()
  if (!snapshotCwd || !existsSync(snapshotCwd)) return false
  try {
    process.chdir(snapshotCwd)
  } catch {
    /* ignore */
  }
  setCwd(snapshotCwd)
  return true
}

export function createConversationFromSnapshot(
  snapshot: PersistedSessionSnapshot | null,
): ConversationBuffers {
  if (!snapshot) return createConversationBuffers()

  const normalizedMessages = normalizeMessages(snapshot.conversation.fullMessages)
  const buffers = createConversationBuffers(normalizedMessages, {
    compactBoundaries: snapshot.conversation.compactBoundaries,
    forceCompactNextProjection: snapshot.conversation.forceCompactNextProjection,
    restoreToolResultBudgetState: true,
    toolResultBudgetRecords: snapshot.conversation.toolResultBudgetRecords,
  })
  restoreLastSummarizedMessageIdFromBoundaries(buffers.compactBoundaries)
  return buffers
}

export function persistConversationSnapshot(
  conversation: ConversationBuffers,
): void {
  const sessionId = getSessionId()
  if (!sessionId) return
  saveConversationSnapshot({
    sessionId,
    cwd: getCwd(),
    model: resolveModel(),
    conversation: serializeConversationBuffers(conversation),
  })
}
