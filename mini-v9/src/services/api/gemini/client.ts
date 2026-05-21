import type { Tool } from '../../../Tool.js'

export interface GeminiConfig {
  apiKey: string
  model: string
}

export function getGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY || ''
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  return { apiKey, model }
}

export function toolsToGeminiFormat(
  tools: Tool[],
): Array<Record<string, unknown>> {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }))
}

export function messagesToGeminiFormat(
  systemPrompt: string,
  messages: Array<{ role: string; content: unknown }>,
): {
  systemInstruction?: Record<string, unknown>
  contents: Array<Record<string, unknown>>
} {
  const contents: Array<Record<string, unknown>> = []

  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user'
    const content =
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content)

    contents.push({
      role,
      parts: [{ text: content }],
    })
  }

  return {
    systemInstruction: systemPrompt
      ? { parts: [{ text: systemPrompt }] }
      : undefined,
    contents,
  }
}

export interface GeminiStreamChunk {
  candidates?: Array<{
    index: number
    content?: {
      role: string
      parts: Array<{ text?: string; functionCall?: Record<string, unknown> }>
    }
    finishReason?: string
  }>
  usageMetadata?: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

export async function* streamGeminiAPI(params: {
  systemPrompt: string
  messages: Array<{ role: string; content: unknown }>
  tools: Tool[]
  model?: string
  signal?: AbortSignal
  maxTokens?: number
}): AsyncGenerator<GeminiStreamChunk> {
  const config = getGeminiConfig()
  if (!config.apiKey) {
    throw new Error('GEMINI_API_KEY not set. Set it via environment variable.')
  }

  const model = params.model || config.model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`

  const { systemInstruction, contents } = messagesToGeminiFormat(
    params.systemPrompt,
    params.messages,
  )

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: params.maxTokens ?? 32000,
      temperature: 0,
    },
  }

  if (params.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: toolsToGeminiFormat(params.tools),
      },
    ]
  }

  if (systemInstruction) {
    body.systemInstruction = systemInstruction
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: params.signal,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${errText}`)
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
        const chunk = JSON.parse(data) as GeminiStreamChunk
        yield chunk
      } catch {
        // Skip unparseable chunks
      }
    }
  }
}
