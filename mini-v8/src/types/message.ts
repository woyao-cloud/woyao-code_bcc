import type {
  TextBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages.js'

// ============================================================
// Message types for the mini CLI
// ============================================================

export type MessageType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'attachment'
  | 'progress'

export type ContentItem =
  | TextBlockParam
  | ToolUseBlockParam
  | ToolResultBlockParam

export interface UserMessage {
  type: 'user'
  message: {
    role: 'user'
    content: string | ContentItem[]
  }
  uuid: string
  timestamp: string
  sessionId: string
}

export interface AssistantMessage {
  type: 'assistant'
  message: {
    role: 'assistant'
    content: ContentItem[]
    model: string
    stop_reason: string | null
    stop_sequence: string | null
    usage: { input_tokens: number; output_tokens: number }
  }
  uuid: string
  timestamp: string
  sessionId: string
}

export interface SystemMessage {
  type: 'system'
  message: {
    role: 'system'
    content: string
  }
  uuid: string
  timestamp: string
  sessionId: string
}

export interface SystemAPIErrorMessage {
  type: 'system_api_error'
  message: {
    role: 'system'
    content: string
    error: string
    retryable: boolean
  }
  uuid: string
  timestamp: string
  sessionId: string
}

export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | SystemAPIErrorMessage

export type StreamEvent =
  | { type: 'content_block_start'; index: number; content_block: ContentItem }
  | {
      type: 'content_block_delta'
      index: number
      delta: { type: string; text?: string; partial_json?: string }
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_start'; message: Record<string, unknown> }
  | {
      type: 'message_delta'
      delta: { stop_reason: string; stop_sequence: string | null }
      usage: { output_tokens: number }
    }
  | { type: 'message_stop' }
  | { type: 'error'; error: Error }

export interface SystemCompactBoundaryMessage {
  type: 'system_compact_boundary'
  message: { role: 'system'; content: string }
  uuid: string
  timestamp: string
  sessionId: string
}
