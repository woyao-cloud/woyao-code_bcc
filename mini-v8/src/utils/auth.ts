/**
 * Get the API key from environment variables.
 * Checks Anthropic, OpenAI, and Gemini keys based on configured provider.
 */

import { isOllamaAutoDetected } from './model/providers.js'

export function getAPIKey(): string | undefined {
  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.CLAUDE_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY

  if (process.env.CLAUDE_CODE_USE_GEMINI === '1') {
    return geminiKey || anthropicKey
  }

  if (process.env.CLAUDE_CODE_USE_OPENAI === '1') {
    return openaiKey || anthropicKey
  }

  if (geminiKey && !anthropicKey && !openaiKey) {
    return geminiKey
  }

  if (!anthropicKey && openaiKey) {
    return openaiKey
  }

  // Auto-detected Ollama — no API key required
  if (isOllamaAutoDetected()) {
    return ''
  }

  return anthropicKey
}

/**
 * Get the Anthropic base URL from env
 */
export function getAnthropicBaseURL(): string | undefined {
  return process.env.ANTHROPIC_BASE_URL || undefined
}

/**
 * Check if we have an API key configured
 */
export function hasAPIKey(): boolean {
  const key = getAPIKey()
  return key !== undefined && key.length > 0
}
