import { describe, expect, test } from 'bun:test'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  clearConversationBuffers,
  consumeForcedCompaction,
  createConversationBuffers,
  projectMessagesForAPI,
  requestForcedCompaction,
} from '../apiProjection.js'
import { MICROCOMPACT_CLEAR_MESSAGE } from '../../compact/autoCompact.js'

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
      'Earlier conversation',
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
})
