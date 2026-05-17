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

export function isOpenAIProvider(): boolean {
  return getAPIProvider() === 'openai'
}

export function isGeminiProvider(): boolean {
  return getAPIProvider() === 'gemini'
}
