import { describe, expect, test } from 'bun:test'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  clearConversationBuffers,
  consumeForcedCompaction,
  createConversationBuffers,
  getConversationToolResultReplacements,
  projectMessagesForAPI,
  requestForcedCompaction,
  serializeConversationBuffers,
} from '../apiProjection.js'
import {
  MICROCOMPACT_CLEAR_MESSAGE,
  TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE,
} from '../../compact/autoCompact.js'

describe('conversation buffers', () => {
  test('tracks a one-shot forced compaction flag', () => {
    const conversation = createConversationBuffers()

    expect(consumeForcedCompaction(conversation)).toBe(false)

    requestForcedCompaction(conversation)
    expect(consumeForcedCompaction(conversation)).toBe(true)
    expect(consumeForcedCompaction(conversation)).toBe(false)
  })

  test('clear resets full messages and pending compaction state', () => {
    const conversation = createConversationBuffers([
      { role: 'user', content: 'hello' },
    ])

    requestForcedCompaction(conversation)
    clearConversationBuffers(conversation)

    expect(conversation.fullMessages.length).toBe(0)
    expect(conversation.forceCompactNextProjection).toBe(false)
    expect(conversation.toolResultBudgetState.replacements.size).toBe(0)
    expect(conversation.toolResultBudgetState.seenToolUseIds.size).toBe(0)
  })
})

describe('projectMessagesForAPI', () => {
  test('keeps full messages intact while projecting a compacted API view', () => {
    const fullMessages: BetaMessageParam[] = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply 1' },
      { role: 'user', content: 'middle 1' },
      { role: 'assistant', content: 'reply 2' },
      { role: 'user', content: 'middle 2' },
      { role: 'assistant', content: 'reply 3' },
      { role: 'user', content: 'latest ask' },
      { role: 'assistant', content: 'latest answer' },
    ]

    const fullSnapshot = JSON.stringify(fullMessages)
    const projection = projectMessagesForAPI(fullMessages, {
      forceCompact: true,
    })

    expect(projection.didCompact).toBe(true)
    expect(projection.projectedMessageCount).toBeGreaterThan(0)
    expect(String(projection.messagesForAPI[1]?.content)).toContain(
      'Compacted',
    )
    expect(JSON.stringify(fullMessages)).toBe(fullSnapshot)
    expect(fullMessages.length).toBe(8)
  })

  test('microcompacts only the API projection and leaves full history untouched', () => {
    const fullMessages: BetaMessageParam[] = [
      { role: 'user', content: 'start' },
    ]

    for (let i = 0; i < 7; i++) {
      fullMessages.push({
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: `tu_${i}`,
            name: 'Read',
            input: { file_path: `src/file-${i}.ts` },
          },
        ],
      })
      fullMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: `tu_${i}`,
            content: `full tool content ${i}`,
          },
        ],
      })
    }

    const projection = projectMessagesForAPI(fullMessages)
    const fullSerialized = JSON.stringify(fullMessages)
    const projectedSerialized = JSON.stringify(projection.messagesForAPI)

    expect(projection.didMicrocompact).toBe(true)
    expect(fullSerialized).toContain('full tool content 0')
    expect(projectedSerialized).toContain(MICROCOMPACT_CLEAR_MESSAGE)
    expect(projectedSerialized).not.toContain('full tool content 0')
  })

  test('budgets oversized tool results only in the API projection', () => {
    const hugeOutput = 'line '.repeat(1_200)
    const fullMessages: BetaMessageParam[] = [
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
    ]

    const projection = projectMessagesForAPI(fullMessages)
    const fullSerialized = JSON.stringify(fullMessages)
    const projectedSerialized = JSON.stringify(projection.messagesForAPI)

    expect(projection.didBudgetToolResults).toBe(true)
    expect(fullSerialized).toContain(hugeOutput.slice(0, 80))
    expect(projectedSerialized).toContain(TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE)
    expect(projectedSerialized).not.toContain(hugeOutput)
  })

  test('replays stored tool-result replacements across projections', () => {
    const hugeOutput = 'line '.repeat(1_200)
    const conversation = createConversationBuffers([
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

    const first = projectMessagesForAPI(conversation)
    const replacementMap = getConversationToolResultReplacements(conversation)
    const storedReplacement = replacementMap.get('tu_big')
    const second = projectMessagesForAPI(conversation)

    expect(first.didBudgetToolResults).toBe(true)
    expect(storedReplacement).toBeDefined()
    expect(second.didBudgetToolResults).toBe(true)
    const secondToolResultMessage = second.messagesForAPI[2]
    expect(Array.isArray(secondToolResultMessage?.content)).toBe(true)
    const secondToolResultBlock = Array.isArray(
      secondToolResultMessage?.content,
    )
      ? secondToolResultMessage.content[0]
      : undefined
    const secondToolResultContent =
      typeof secondToolResultBlock === 'object' &&
      secondToolResultBlock !== null &&
      'content' in secondToolResultBlock
        ? secondToolResultBlock.content
        : undefined

    expect(String(secondToolResultContent)).toContain(
      TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE,
    )
    expect(secondToolResultContent).toBe(storedReplacement)
  })

  test('restores replacement state from a serialized conversation snapshot', () => {
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
    const snapshot = serializeConversationBuffers(original)
    const restored = createConversationBuffers(snapshot.fullMessages, {
      compactBoundaries: snapshot.compactBoundaries,
      forceCompactNextProjection: snapshot.forceCompactNextProjection,
      toolResultBudgetRecords: snapshot.toolResultBudgetRecords,
    })
    const restoredProjection = projectMessagesForAPI(restored)

    expect(snapshot.toolResultBudgetRecords.length).toBe(1)
    expect(restoredProjection.didBudgetToolResults).toBe(true)
    expect(JSON.stringify(restoredProjection.messagesForAPI)).toContain(
      TOOL_RESULT_BUDGET_TRUNCATED_MESSAGE,
    )
    expect(getConversationToolResultReplacements(restored).get('tu_big')).toBe(
      snapshot.toolResultBudgetRecords[0]?.replacement,
    )
  })

  test('commits a compact boundary into fullMessages and projects only the active slice', () => {
    const conversation = createConversationBuffers([
      { role: 'user', content: 'first request' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'middle request 1' },
      { role: 'assistant', content: 'middle answer 1' },
      { role: 'user', content: 'middle request 2' },
      { role: 'assistant', content: 'middle answer 2' },
      { role: 'user', content: 'latest request' },
      { role: 'assistant', content: 'latest answer' },
    ])

    const compacted = projectMessagesForAPI(conversation, {
      forceCompact: true,
      commitCompactionToConversation: true,
    })

    expect(compacted.didCompact).toBe(true)
    expect(conversation.compactBoundaries.length).toBe(1)
    expect(
      conversation.compactBoundaries[0]?.projectedMessageCount,
    ).toBeGreaterThan(0)

    const replay = projectMessagesForAPI(conversation)
    expect(JSON.stringify(replay.messagesForAPI)).not.toContain('first request')
    expect(JSON.stringify(replay.messagesForAPI)).toContain('latest request')
  })

  test('restores from a compact-boundary snapshot using only the post-boundary slice', () => {
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

    const snapshot = serializeConversationBuffers(original)
    const restored = createConversationBuffers(snapshot.fullMessages, {
      compactBoundaries: snapshot.compactBoundaries,
      forceCompactNextProjection: snapshot.forceCompactNextProjection,
      toolResultBudgetRecords: snapshot.toolResultBudgetRecords,
      restoreToolResultBudgetState: true,
    })
    const replay = projectMessagesForAPI(restored)

    expect(restored.compactBoundaries.length).toBe(1)
    expect(JSON.stringify(replay.messagesForAPI)).not.toContain('first request')
    expect(JSON.stringify(replay.messagesForAPI)).toContain('latest request')
  })
})
