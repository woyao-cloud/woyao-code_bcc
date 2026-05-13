/**
 * OpenAI-compatible API client for mini-v2.
 * Uses raw fetch - no OpenAI SDK dependency needed.
 * Supports any OpenAI Chat Completions compatible endpoint
 * (Ollama, DeepSeek, vLLM, etc.)
 *
 * Env vars:
 *   OPENAI_API_KEY  - API key (required)
 *   OPENAI_BASE_URL - Base URL (default: https://api.openai.com/v1)
 *   OPENAI_MODEL    - Model name (default: gpt-4o)
 */

import type { Tool } from '../../../Tool.js'

export interface OpenAIConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export function getOpenAIConfig(): OpenAIConfig {
  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseUrl = process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1'
  //'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'deepseek-v4-pro:cloud'
  return { apiKey, baseUrl, model }
}

/**
 * Convert internal Tool schema to OpenAI function/tool format
 */
export function toolsToOpenAIFormat(
  tools: Tool[],
): Array<Record<string, unknown>> {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))
}

/**
 * Convert internal messages to OpenAI chat format
 */
export function messagesToOpenAIFormat(
  messages: Array<{ role: string; content: unknown }>,
): Array<{ role: string; content: unknown }> {
  return messages.map(m => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))
}

export interface OpenAIStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: string
      content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface OpenAIRequest {
  model: string
  messages: Array<{ role: string; content: unknown }>
  tools?: Array<Record<string, unknown>>
  stream?: boolean
  max_tokens?: number
  temperature?: number
}

/**
 * Call OpenAI-compatible API with streaming
 */
export async function* streamOpenAIAPI(params: {
  systemPrompt: string
  messages: Array<{ role: string; content: unknown }>
  tools: Tool[]
  model?: string
  signal?: AbortSignal
  maxTokens?: number
}): AsyncGenerator<OpenAIStreamChunk> {
  const config = getOpenAIConfig()
  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY not set. Set it via environment variable.')
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`

  const body: OpenAIRequest = {
    model: params.model || config.model,
    messages: [
      { role: 'system', content: params.systemPrompt },
      ...messagesToOpenAIFormat(params.messages),
    ],
    tools:
      params.tools.length > 0 ? toolsToOpenAIFormat(params.tools) : undefined,
    stream: true,
    max_tokens: params.maxTokens ?? 32000,
    temperature: 0,
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenAI API error ${response.status}: ${errText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6)
      if (data === '[DONE]') return
      try {
        const chunk = JSON.parse(data) as OpenAIStreamChunk
        yield chunk
      } catch {
        // Skip unparseable chunks
      }
    }
  }
}
