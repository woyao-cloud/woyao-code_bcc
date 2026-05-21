/**
 * Provider selection for mini-v5.
 * Supports Anthropic firstParty, OpenAI-compatible, and Gemini APIs.
 */

export type APIProvider = 'firstParty' | 'openai' | 'gemini'

/**
 * Get the API provider based on environment variables.
 * Priority:
 *   1. ANTHROPIC_BASE_URL + Anthropic auth -> firstParty (custom endpoint)
 *   2. CLAUDE_CODE_USE_GEMINI=1 -> gemini
 *   3. CLAUDE_CODE_USE_OPENAI=1 -> openai
 *   4. GEMINI_API_KEY without other keys -> gemini
 *   5. OPENAI_API_KEY without ANTHROPIC_API_KEY -> openai
 *   6. default -> firstParty
 */
export function getAPIProvider(): APIProvider {
  const hasAnthropicAuth =
    !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN
  const hasAnthropicBase = !!process.env.ANTHROPIC_BASE_URL

  if (hasAnthropicBase && hasAnthropicAuth) {
    return 'firstParty'
  }

  if (process.env.CLAUDE_CODE_USE_GEMINI === '1') return 'gemini'

  if (process.env.CLAUDE_CODE_USE_OPENAI === '1') return 'openai'

  if (
    process.env.GEMINI_API_KEY &&
    !process.env.ANTHROPIC_API_KEY &&
    !process.env.OPENAI_API_KEY
  ) {
    return 'gemini'
  }

  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return 'openai'
  }

  return 'firstParty'
}

export function isFirstPartyAnthropicBaseUrl(): boolean {
  return getAPIProvider() === 'firstParty'
}

/**
 * Get the base URL for the currently active API provider.
 * Returns a human-readable URL string for display purposes.
 */
export function getBaseURL(): string {
  const provider = getAPIProvider()

  if (provider === 'openai') {
    return process.env.OPENAI_BASE_URL || 'http://localhost:11434/v1'
  }

  if (provider === 'gemini') {
    return 'https://generativelanguage.googleapis.com/v1beta/'
  }

  // firstParty (Anthropic)
  return process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
}

export function isOpenAIProvider(): boolean {
  return getAPIProvider() === 'openai'
}

export function isGeminiProvider(): boolean {
  return getAPIProvider() === 'gemini'
}
