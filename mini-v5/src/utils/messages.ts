import { randomUUID } from './crypto.js'
import type { UserMessage, SystemMessage } from '../types/message.js'
import type { SessionId } from '../types/ids.js'

/**
 * Create a user message
 */
export function createUserMessage(
  content: string,
  sessionId: SessionId,
): UserMessage {
  return {
    type: 'user',
    message: {
      role: 'user',
      content,
    },
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: sessionId as string,
  }
}

/**
 * Create a system message
 */
export function createSystemMessage(
  content: string,
  sessionId: SessionId,
): SystemMessage {
  return {
    type: 'system',
    message: {
      role: 'system',
      content,
    },
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId: sessionId as string,
  }
}

/**
 * Count tool calls in messages
 */
export function countToolCalls(
  messages: Array<{ message?: { content?: unknown } }>,
): number {
  let count = 0
  for (const msg of messages) {
    const content = msg.message?.content
    if (Array.isArray(content)) {
      for (const block of content) {
        if (
          block &&
          typeof block === 'object' &&
          'type' in block &&
          (block as Record<string, unknown>).type === 'tool_use'
        ) {
          count++
        }
      }
    }
  }
  return count
}
