import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createConversationBuffers,
  projectMessagesForAPI,
  serializeConversationBuffers,
} from '../../messages/apiProjection.js'
import { TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE } from '../../compact/autoCompact.js'
import {
  loadConversationSnapshot,
  loadLatestConversationSnapshot,
  saveConversationSnapshot,
  setSessionStoreDir,
} from '../sessionStore.js'

let tempDir: string

describe('sessionStore', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mini-v8-session-store-'))
    setSessionStoreDir(tempDir)
  })

  afterEach(() => {
    setSessionStoreDir(null)
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('persists replacement-state snapshots that can be restored from disk', () => {
    const hugeOutput = 'line '.repeat(1_200)
    const original = createConversationBuffers([
      { role: 'user', content: 'inspect this large read result' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'tu_big',
            name: 'Read',
            input: { file_path: 'src/huge-file.ts' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_big',
            content: hugeOutput,
          },
        ],
      },
    ])

    projectMessagesForAPI(original)
    saveConversationSnapshot({
      sessionId: 'session-budget',
      cwd: tempDir,
      conversation: serializeConversationBuffers(original),
    })

    const loaded = loadConversationSnapshot('session-budget')
    expect(loaded).not.toBe(null)

    const restored = createConversationBuffers(
      loaded!.conversation.fullMessages,
      {
        compactBoundaries: loaded!.conversation.compactBoundaries,
        forceCompactNextProjection:
          loaded!.conversation.forceCompactNextProjection,
        restoreToolResultBudgetState: true,
        toolResultBudgetRecords: loaded!.conversation.toolResultBudgetRecords,
      },
    )
    const replay = projectMessagesForAPI(restored)

    expect(loaded!.conversation.toolResultBudgetRecords.length).toBe(1)
    expect(JSON.stringify(replay.messagesForAPI)).toContain(
      TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE,
    )
  })

  test('loads the newest valid snapshot and preserves compact boundaries', () => {
    const original = createConversationBuffers([
      { role: 'user', content: 'first request' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'middle request 1' },
      { role: 'assistant', content: 'middle answer 1' },
      { role: 'user', content: 'middle request 2' },
      { role: 'assistant', content: 'middle answer 2' },
      { role: 'user', content: 'latest request' },
      { role: 'assistant', content: 'latest answer' },
    ])

    projectMessagesForAPI(original, {
      forceCompact: true,
      commitCompactionToConversation: true,
    })
    saveConversationSnapshot({
      sessionId: 'session-old',
      cwd: tempDir,
      conversation: serializeConversationBuffers(original),
    })

    const latest = createConversationBuffers([
      { role: 'user', content: 'continue from here' },
      { role: 'assistant', content: 'resumed answer' },
    ])
    saveConversationSnapshot({
      sessionId: 'session-latest',
      cwd: tempDir,
      conversation: serializeConversationBuffers(latest),
    })

    writeFileSync(join(tempDir, 'session-corrupt.json'), 'not json', 'utf-8')

    const loadedLatest = loadLatestConversationSnapshot()
    expect(loadedLatest?.sessionId).toBe('session-latest')

    const loadedCompacted = loadConversationSnapshot('session-old')
    expect(loadedCompacted?.conversation.compactBoundaries.length).toBe(1)

    const restoredCompacted = createConversationBuffers(
      loadedCompacted!.conversation.fullMessages,
      {
        compactBoundaries: loadedCompacted!.conversation.compactBoundaries,
        forceCompactNextProjection:
          loadedCompacted!.conversation.forceCompactNextProjection,
        restoreToolResultBudgetState: true,
        toolResultBudgetRecords:
          loadedCompacted!.conversation.toolResultBudgetRecords,
      },
    )
    const replay = projectMessagesForAPI(restoredCompacted)

    expect(JSON.stringify(replay.messagesForAPI)).not.toContain('first request')
    expect(JSON.stringify(replay.messagesForAPI)).toContain('latest request')
  })
})
