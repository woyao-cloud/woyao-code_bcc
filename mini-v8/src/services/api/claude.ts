import { Anthropic } from '@anthropic-ai/sdk'
import type {
  BetaMessageParam,
  BetaRawMessageStreamEvent,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.js'
import type { Tool } from '../../Tool.js'
import { getAPIKey, getAnthropicBaseURL } from '../../utils/auth.js'
import { resolveModel } from '../../utils/model/model.js'
import { BETAS } from '../../constants/betas.js'
import {
  isOpenAIProvider,
  isGeminiProvider,
} from '../../utils/model/providers.js'
import { streamOpenAIAPI, getOpenAIConfig } from './openai/client.js'
import { openAIToAnthropicStream } from './openai/streamAdapter.js'
import { resolveOpenAIModel } from './openai/modelMap.js'
import { streamGeminiAPI, getGeminiConfig } from './gemini/client.js'
import { geminiToAnthropicStream } from './gemini/streamAdapter.js'
import { resolveGeminiModel } from './gemini/modelMap.js'

// ============================================================
// API Client for mini-v5 (Anthropic + OpenAI)
// ============================================================

const MAX_TOKENS = 32000

export interface QueryParams {
  systemPrompt: string
  messages: BetaMessageParam[]
  tools: Tool[]
  model?: string
  signal?: AbortSignal
  maxTokens?: number
}

/**
 * Non-streaming API call (Anthropic only)
 */
export async function callClaudeAPI(params: QueryParams) {
  const apiKey = getAPIKey()
  if (!apiKey) {
    throw new Error('API key not set. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.')
  }

  const model = resolveModel(params.model)
  const baseURL = getAnthropicBaseURL()
  const client = new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  })

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
    betas: baseURL
      ? ([] as unknown as [string, ...string[]])
      : (BETAS as [string, ...string[]]),
  })

  return response
}

/**
 * Streaming API call - auto-selects Anthropic or OpenAI provider
 */
export async function* streamClaudeAPI(
  params: QueryParams,
): AsyncGenerator<BetaRawMessageStreamEvent> {
  if (isGeminiProvider()) {
    const config = getGeminiConfig()
    if (!config.apiKey) {
      throw new Error('GEMINI_API_KEY not set.')
    }

    const geminiModel = params.model
      ? resolveGeminiModel(resolveModel(params.model))
      : config.model

    const geminiStream = streamGeminiAPI({
      systemPrompt: params.systemPrompt,
      messages: params.messages as Array<{ role: string; content: unknown }>,
      tools: params.tools,
      model: geminiModel,
      signal: params.signal,
      maxTokens: params.maxTokens,
    })

    yield* geminiToAnthropicStream(geminiStream)
  } else if (isOpenAIProvider()) {
    // Use OpenAI-compatible path
    const config = getOpenAIConfig()
    if (!config.apiKey) {
      throw new Error('OPENAI_API_KEY not set.')
    }

    const resolvedModel = params.model
      ? resolveOpenAIModel(resolveModel(params.model))
      : config.model

    const openAIStream = streamOpenAIAPI({
      systemPrompt: params.systemPrompt,
      messages: params.messages as Array<{ role: string; content: unknown }>,
      tools: params.tools,
      model: resolvedModel,
      signal: params.signal,
      maxTokens: params.maxTokens,
    })

    yield* openAIToAnthropicStream(openAIStream)
  } else {
    // Anthropic firstParty path (also used for local proxies like Ollama)
    const apiKey = getAPIKey()
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set.')
    }

    const model = resolveModel(params.model)
    const baseURL = getAnthropicBaseURL()
    const client = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    })

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
        betas: baseURL
          ? ([] as unknown as [string, ...string[]])
          : (BETAS as [string, ...string[]]),
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
}

export function accumulateUsage(
  current: { input_tokens: number; output_tokens: number },
  delta: { input_tokens?: number; output_tokens?: number },
) {
  if (delta.input_tokens) current.input_tokens += delta.input_tokens
  if (delta.output_tokens) current.output_tokens += delta.output_tokens
  return current
}

export type NonNullableUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export const EMPTY_USAGE: NonNullableUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}
