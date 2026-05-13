import { Anthropic } from '@anthropic-ai/sdk'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.js'
import type { Tool } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { getAPIKey } from '../../utils/auth.js'
import { getCwd } from '../../bootstrap/state.js'
import { resolveModel } from '../../utils/model/model.js'
import { BETAS } from '../../constants/betas.js'
import { getAPIProvider } from '../../utils/model/providers.js'

// ============================================================
// API Client for the mini CLI
// ============================================================

/** Maximum tokens for the model response */
const MAX_TOKENS = 32000

export interface QueryParams {
  /** System prompt */
  systemPrompt: string
  /** Messages to send */
  messages: BetaMessageParam[]
  /** Available tools */
  tools: Tool[]
  /** Model override */
  model?: string
  /** Abort signal */
  signal?: AbortSignal
  /** Max tokens for this request */
  maxTokens?: number
}

/**
 * Make a non-streaming API call to Claude
 */
export async function callClaudeAPI(params: QueryParams) {
  const apiKey = getAPIKey()
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Set it via environment variable.',
    )
  }

  const model = resolveModel(params.model)
  const provider = getAPIProvider()

  const client = new Anthropic({ apiKey })

  const response = await client.beta.messages.create({
    model,
    max_tokens: params.maxTokens ?? MAX_TOKENS,
    system: params.systemPrompt,
    messages: params.messages,
    tools: params.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    })),
    betas: BETAS as [string, ...string[]],
  })

  return response
}

/**
 * Make a streaming API call to Claude
 */
export async function* streamClaudeAPI(params: QueryParams) {
  const apiKey = getAPIKey()
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Set it via environment variable.',
    )
  }

  const model = resolveModel(params.model)
  const client = new Anthropic({ apiKey })

  const stream = await client.beta.messages.create(
    {
      model,
      max_tokens: params.maxTokens ?? MAX_TOKENS,
      system: params.systemPrompt,
      messages: params.messages,
      tools: params.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
      betas: BETAS as [string, ...string[]],
      stream: true as const,
    },
    {
      signal: params.signal,
    },
  )

  for await (const event of stream) {
    yield event
  }
}

/**
 * Accumulate usage from API responses
 */
export function accumulateUsage(
  current: { input_tokens: number; output_tokens: number },
  delta: { input_tokens?: number; output_tokens?: number },
) {
  if (delta.input_tokens) current.input_tokens += delta.input_tokens
  if (delta.output_tokens) current.output_tokens += delta.output_tokens
  return current
}

/** Non-nullable usage type */
export type NonNullableUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

/** Empty (zero) usage */
export const EMPTY_USAGE: NonNullableUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}
