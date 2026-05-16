import {
  microcompactToolResults,
  compactMessages,
  needsCompaction,
} from './autoCompact.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

export const PROMPT_TOO_LONG_ERROR_PATTERNS = [
  'prompt_too_long',
  'too large',
  'too long',
  'maximum context length',
  'context window',
  '413',
]

export function isPromptTooLongError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase()
  return PROMPT_TOO_LONG_ERROR_PATTERNS.some(pattern => lower.includes(pattern))
}

export interface ReactiveCompactResult {
  didCompact: boolean
  messages: BetaMessageParam[]
}

export function reactiveCompact(
  messages: BetaMessageParam[],
  model?: string,
): ReactiveCompactResult {
  const microcompacted = microcompactToolResults(messages)
  if (microcompacted !== messages) {
    if (!needsCompaction(microcompacted, model)) {
      return { didCompact: true, messages: microcompacted }
    }
  }

  const compacted = compactMessages(microcompacted, { keepPairs: 2 })
  if (compacted !== microcompacted) {
    return { didCompact: true, messages: compacted }
  }

  const lastResort = compactMessages(microcompacted, { keepPairs: 1 })
  return { didCompact: lastResort !== microcompacted, messages: lastResort }
}
