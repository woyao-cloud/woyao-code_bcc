import { describe, expect, test } from 'bun:test'
import {
  createUserMessage,
  createSystemMessage,
  countToolCalls,
} from '../utils/messages.js'
import type { SessionId } from '../types/ids.js'

describe('createUserMessage', () => {
  const sessionId = 'sess_001' as SessionId

  test('returns a user message with correct type', () => {
    const msg = createUserMessage('hello world', sessionId)
    expect(msg.type).toBe('user')
    expect(msg.message.role).toBe('user')
    expect(msg.message.content).toBe('hello world')
  })

  test('generates a UUID', () => {
    const msg = createUserMessage('test', sessionId)
    expect(typeof msg.uuid).toBe('string')
    expect(msg.uuid.length).toBe(36)
  })

  test('generates unique UUIDs for different messages', () => {
    const msg1 = createUserMessage('a', sessionId)
    const msg2 = createUserMessage('b', sessionId)
    expect(msg1.uuid).not.toBe(msg2.uuid)
  })

  test('sets ISO timestamp', () => {
    const msg = createUserMessage('test', sessionId)
    const parsed = Date.parse(msg.timestamp)
    expect(isNaN(parsed)).toBe(false)
  })

  test('sets correct sessionId', () => {
    const msg = createUserMessage('test', sessionId)
    expect(msg.sessionId).toBe('sess_001')
  })
})

describe('createSystemMessage', () => {
  const sessionId = 'sess_002' as SessionId

  test('returns a system message with correct type', () => {
    const msg = createSystemMessage('system instruction', sessionId)
    expect(msg.type).toBe('system')
    expect(msg.message.role).toBe('system')
    expect(msg.message.content).toBe('system instruction')
  })

  test('generates a UUID', () => {
    const msg = createSystemMessage('test', sessionId)
    expect(typeof msg.uuid).toBe('string')
  })
})

describe('countToolCalls', () => {
  test('returns 0 for empty messages', () => {
    expect(countToolCalls([])).toBe(0)
  })

  test('counts tool_use blocks', () => {
    const messages = [
      {
        message: {
          content: [
            { type: 'text', text: 'hello' },
            { type: 'tool_use', id: 'tu_1', name: 'Bash', input: {} },
            { type: 'tool_use', id: 'tu_2', name: 'Read', input: {} },
          ],
        },
      },
    ]
    expect(countToolCalls(messages)).toBe(2)
  })

  test('handles messages without content', () => {
    const messages = [{ message: {} }, { message: { content: 'plain text' } }]
    expect(countToolCalls(messages)).toBe(0)
  })

  test('counts across multiple messages', () => {
    const messages = [
      {
        message: {
          content: [{ type: 'tool_use', id: 'tu_1', name: 'Bash', input: {} }],
        },
      },
      {
        message: {
          content: [{ type: 'tool_use', id: 'tu_2', name: 'Read', input: {} }],
        },
      },
    ]
    expect(countToolCalls(messages)).toBe(2)
  })
})
