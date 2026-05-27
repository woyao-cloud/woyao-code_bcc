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
  const model = process.env.OPENAI_MODEL || 'deepseek-v4-flash:cloud'
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
 * Convert internal messages (Anthropic format) to OpenAI chat format.
 *
 * Key conversions:
 *   - assistant msg with tool_use blocks → { role, content, tool_calls }
 *   - user msg with tool_result blocks  → { role: 'tool', tool_call_id, content }
 *   - simple messages pass through as-is
 */
export function messagesToOpenAIFormat(
  messages: Array<{ role: string; content: unknown }>,
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = []

  for (const m of messages) {
    // Assistant message with content array (may contain tool_use blocks)
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const textParts: string[] = []
      const toolCalls: Array<Record<string, unknown>> = []

      for (const block of m.content) {
        const b = block as Record<string, unknown>
        if (b.type === 'text') {
          if (typeof b.text === 'string') textParts.push(b.text)
        } else if (b.type === 'tool_use') {
          toolCalls.push({
            id: b.id,
            type: 'function',
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input ?? {}),
            },
          })
        }
      }

      if (toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: textParts.join('') || null,
          tool_calls: toolCalls,
        })
      } else {
        result.push({
          role: 'assistant',
          content: textParts.join('') || '',
        })
      }
      continue
    }

    // User message with tool_result blocks → OpenAI 'tool' role
    if (m.role === 'user' && Array.isArray(m.content)) {
      const toolResults = m.content.filter(
        (c: unknown) =>
          typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'tool_result',
      )

      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          const trBlock = tr as Record<string, unknown>
          result.push({
            role: 'tool',
            tool_call_id: trBlock.tool_use_id,
            content:
              typeof trBlock.content === 'string'
                ? trBlock.content
                : JSON.stringify(trBlock.content),
          })
        }
        continue
      }
    }

    // Default pass-through
    result.push({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    })
  }

  return result
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
  if (!config.apiKey && !config.baseUrl.includes('localhost')) {
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
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
