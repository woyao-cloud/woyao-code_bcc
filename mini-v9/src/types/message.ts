import type {
  TextBlockParam,
  ToolUseBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages/messages.js'
import type { AgentId, SessionId, MessageUuid } from './ids.js'

// ============================================================
// Message types for the mini CLI
// ============================================================

export type MessageType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'attachment'
  | 'progress'
  | 'thinking'
  | 'tool_use_summary'

/** API-compatible content block types */
export type ContentItem =
  | TextBlockParam
  | ToolUseBlockParam
  | ToolResultBlockParam

/** Extended content block types for internal use (not API-compatible) */
export type ExtendedContentItem =
  | ContentItem
  | {
      type: 'image'
      source: { type: string; media_type: string; data: string }
    }
  | { type: 'thinking'; thinking: string; signature?: string }

export interface UserMessage {
  type: 'user'
  message: {
    role: 'user'
    content: string | ContentItem[]
  }
  uuid: string
  timestamp: string
  sessionId: string
  agentId?: AgentId
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
  agentId?: AgentId
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

export interface ProgressMessage {
  type: 'progress'
  data: { type: string; [key: string]: unknown }
  uuid: string
  timestamp: string
}

export interface AttachmentMessage {
  type: 'attachment'
  attachment: { type: string; [key: string]: unknown }
  uuid: string
  timestamp: string
}

export interface SystemThinkingMessage {
  type: 'system_thinking'
  message: { content: string }
  uuid: string
  timestamp: string
}

export interface ToolUseSummaryMessage {
  type: 'tool_use_summary'
  message: { role: 'tool_use_summary'; content: string }
  uuid: string
  timestamp: string
}

export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | SystemAPIErrorMessage
  | SystemCompactBoundaryMessage
  | ProgressMessage
  | AttachmentMessage
  | SystemThinkingMessage
  | ToolUseSummaryMessage

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
