export type QueryTerminalReason =
  | 'completed'
  | 'max_turns'
  | 'model_error'
  | 'aborted'

export type QueryContinueReason = 'next_turn' | 'max_output_tokens_retry'

export interface QueryTerminal {
  readonly type: 'terminal'
  reason: QueryTerminalReason
  turnCount: number
  totalInputTokens: number
  totalOutputTokens: number
  error?: string
}

export interface QueryUsage {
  readonly type: 'usage'
  inputTokens: number
  outputTokens: number
  totalInputTokens: number
  totalOutputTokens: number
}

export interface QueryTextDelta {
  readonly type: 'text_delta'
  text: string
}

export interface QueryToolStart {
  readonly type: 'tool_start'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface QueryToolResult {
  readonly type: 'tool_result'
  id: string
  name: string
  success: boolean
  content: string
  isError: boolean
}

export interface QueryTurnEnd {
  readonly type: 'turn_end'
  turnCount: number
  toolUseCount: number
}

export interface QueryError {
  readonly type: 'error'
  message: string
}

export interface QueryRecovery {
  readonly type: 'recovery'
  reason: 'max_tokens_escalate' | 'max_tokens_continue'
  attempt: number
}

export interface QueryRetryEvent {
  readonly type: 'retry_event'
  attempt: number
  maxRetries: number
  error: string
  category: string
  delayMs: number
}

export type QueryEvent =
  | QueryTextDelta
  | QueryToolStart
  | QueryToolResult
  | QueryUsage
  | QueryTurnEnd
  | QueryTerminal
  | QueryError
  | QueryRecovery
  | QueryRetryEvent
