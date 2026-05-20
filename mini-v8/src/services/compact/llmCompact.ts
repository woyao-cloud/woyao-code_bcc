/**
 * LLM-based compaction — delegates summary generation to the Claude API using
 * structured compaction prompt templates. This produces richer semantic summaries
 * than the heuristic approach in autoCompact.ts.
 *
 * Usage: call compacted = await llmCompact(messages) during projection when an
 * API call is acceptable, or use generateCompactSummary to pre-compute a summary
 * string for later injection via compactMessages.
 */

import { callClaudeAPI, streamClaudeAPI } from '../api/claude.js'
import {
  getCompactPrompt,
  getPartialCompactPrompt,
  formatCompactSummary,
} from './prompt.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ============================================================
// Types
// ============================================================

export interface LLMCompactOptions {
  /**
   * Direction for partial compaction.
   * 'from' — summarize recent messages only (default).
   * 'up_to' — summarize prefix, newer messages kept verbatim.
   */
  direction?: 'from' | 'up_to'

  /** Custom instructions appended to the compaction prompt. */
  customInstructions?: string

  /** System prompt used for the compaction API call. */
  systemPrompt?: string

  /** Model override for the compaction call (defaults to main session model). */
  model?: string

  /** AbortSignal for cancellation. */
  signal?: AbortSignal

  /** Whether the recent messages will be preserved verbatim after compaction. */
  recentMessagesPreserved?: boolean

  /** Suppress follow-up questions in the user summary message. */
  suppressFollowUpQuestions?: boolean
}

export interface LLMCompactResult {
  /** Whether compaction produced a meaningful summary. */
  didCompact: boolean

  /** The raw summary string from the LLM (including <analysis> + <summary>). */
  rawSummary: string

  /** The formatted summary with <analysis> stripped. */
  formattedSummary: string

  /** The complete compacted message array (system + summary + recent messages). */
  messages: BetaMessageParam[]

  /** Error message if compaction failed. */
  error?: string
}

// ============================================================
// Constants
// ============================================================

const DEFAULT_SYSTEM_PROMPT =
  'You are a conversation summarizer. Produce accurate, detailed summaries of technical conversations.'
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1000

// ============================================================
// Core: Full Compaction
// ============================================================

/**
 * Perform full LLM-based compaction.
 * Takes the full message list, summarizes removable messages via the API,
 * and returns a compacted message array.
 *
 * The system message (messages[0]) is always preserved.
 * Messages before the keep window are summarized into a single assistant message.
 */
export async function llmCompact(
  messages: BetaMessageParam[],
  options: LLMCompactOptions = {},
): Promise<LLMCompactResult> {
  const keepCount = Math.min(options.direction === 'up_to' ? 2 : 3, Math.max(1, messages.length - 1))
  const tailSize = Math.min(keepCount * 2, messages.length - 1)
  let startIndex = Math.max(1, messages.length - tailSize)

  if (startIndex <= 1) {
    return {
      didCompact: false,
      rawSummary: '',
      formattedSummary: '',
      messages,
    }
  }

  const removed = messages.slice(1, startIndex)
  const summary = await generateCompactSummary(removed, {
    customInstructions: options.customInstructions,
    systemPrompt: options.systemPrompt,
    model: options.model,
    signal: options.signal,
  })

  if (!summary) {
    return {
      didCompact: false,
      rawSummary: '',
      formattedSummary: '',
      messages,
    }
  }

  const kept = [messages[0]]
  if (summary) {
    kept.push({
      role: 'assistant',
      content: summary,
    })
  }
  kept.push(...messages.slice(startIndex))

  return {
    didCompact: true,
    rawSummary: summary,
    formattedSummary: formatCompactSummary(summary),
    messages: kept,
  }
}

// ============================================================
// Summary Generation (API call)
// ============================================================

/**
 * Call the API to generate a compaction summary for the given message span.
 * Uses the BASE compaction prompt template.
 */
export async function generateCompactSummary(
  messages: BetaMessageParam[],
  options: LLMCompactOptions = {},
): Promise<string> {
  if (messages.length === 0) return ''

  const prompt = getCompactPrompt(options.customInstructions)

  const userContent = buildUserCompactionContent(messages)

  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(RETRY_DELAY_MS)
      }

      const response = await callClaudeAPI({
        systemPrompt,
        messages: [
          { role: 'user', content: prompt },
          { role: 'user', content: userContent },
        ],
        tools: [],
        model: options.model,
        signal: options.signal,
      })

      const summaryText = extractSummaryContent(response.content)
      if (summaryText) {
        return summaryText
      }

      // If response content is text, use it
      const content = response.content[0]
      if (content && 'text' in content && typeof content.text === 'string') {
        return content.text
      }

      lastError = new Error('No text content in API response')

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  return ''
}

/**
 * Generate a partial compaction summary for the recent portion of the conversation.
 * Uses the PARTIAL compaction prompt template.
 */
export async function generatePartialCompactSummary(
  messages: BetaMessageParam[],
  options: LLMCompactOptions = {},
): Promise<string> {
  if (messages.length === 0) return ''

  const prompt = getPartialCompactPrompt(
    options.customInstructions,
    options.direction,
  )

  const userContent = buildUserCompactionContent(messages)
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(RETRY_DELAY_MS)
      }

      const response = await callClaudeAPI({
        systemPrompt,
        messages: [
          { role: 'user', content: prompt },
          { role: 'user', content: userContent },
        ],
        tools: [],
        model: options.model,
        signal: options.signal,
      })

      const summaryText = extractSummaryContent(response.content)
      if (summaryText) {
        return summaryText
      }

      const content = response.content[0]
      if (content && 'text' in content && typeof content.text === 'string') {
        return content.text
      }

      lastError = new Error('No text content in API response')

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  return ''
}

// ============================================================
// Streaming Summary Generation
// ============================================================

/**
 * Generate compaction summary with streaming response.
 * Returns the full text once streaming completes.
 */
export async function generateCompactSummaryStreaming(
  messages: BetaMessageParam[],
  options: LLMCompactOptions = {},
): Promise<string> {
  if (messages.length === 0) return ''

  const prompt = getCompactPrompt(options.customInstructions)
  const userContent = buildUserCompactionContent(messages)
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(RETRY_DELAY_MS)
      }

      const parts: string[] = []
      for await (const event of streamClaudeAPI({
        systemPrompt,
        messages: [
          { role: 'user', content: prompt },
          { role: 'user', content: userContent },
        ],
        tools: [],
        model: options.model,
        signal: options.signal,
      })) {
        if (
          event.type === 'content_block_delta' &&
          event.delta?.type === 'text_delta'
        ) {
          parts.push(event.delta.text)
        }
      }

      const fullText = parts.join('')
      const summaryText = extractSummaryContent(fullText)
      if (summaryText) {
        return summaryText
      }

      if (fullText.trim()) {
        return fullText.trim()
      }

      lastError = new Error('Empty streaming response')

    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  return ''
}

// ============================================================
// Integration with autoCompact compactMessages
// ============================================================

/**
 * Build a user message containing the conversation content for summarization.
 * Truncates each message to stay within reasonable token limits.
 */
function buildUserCompactionContent(messages: BetaMessageParam[]): string {
  const parts: string[] = ['Here is the conversation content to summarize:\n']

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const prefix = `--- Message ${i + 1} (${msg.role}) ---`
    let content = ''

    if (typeof msg.content === 'string') {
      content = msg.content
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .map(block => {
          if (typeof block === 'string') return block
          const b = block as Record<string, unknown>
          if (b.type === 'text' && typeof b.text === 'string') return b.text
          if (b.type === 'tool_use') {
            return `[Tool: ${b.name}]\n${JSON.stringify(b.input, null, 2)}`
          }
          if (b.type === 'tool_result') {
            return `[Tool Result]\n${stringifyContent(b.content)}`
          }
          return JSON.stringify(b)
        })
        .join('\n')
    }

    // Truncate overly long messages to prevent blowing the compaction budget
    if (content.length > 4000) {
      content = content.slice(0, 4000) + '\n...[truncated]'
    }

    parts.push(`${prefix}\n${content}`)
  }

  return parts.join('\n\n')
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (typeof block === 'string') return block
        const b = block as Record<string, unknown>
        if (typeof b.text === 'string') return b.text
        return JSON.stringify(b)
      })
      .join('\n')
  }
  if (content && typeof content === 'object') {
    return JSON.stringify(content)
  }
  return String(content ?? '')
}

function extractSummaryContent(response: unknown): string | null {
  const content = response as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(content)) return null

  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      const text = block.text

      // Try to extract <summary> block
      const summaryMatch = text.match(/<summary>([\s\S]*?)<\/summary>/)
      if (summaryMatch) {
        return summaryMatch[1].trim()
      }

      // Try to extract <analysis> block (less ideal but still useful)
      const analysisMatch = text.match(/<analysis>[\s\S]*?<\/analysis>\s*([\s\S]*)/)
      if (analysisMatch) {
        return analysisMatch[1].trim()
      }

      // No XML tags — return text as-is
      return text.trim()
    }
  }

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
