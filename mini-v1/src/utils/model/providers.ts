/**
 * Provider selection for mini-v5.
 * Supports Anthropic firstParty and OpenAI-compatible APIs.
 */

export type APIProvider = 'firstParty' | 'openai'

/**
 * Get the API provider based on environment variables.
 * Priority:
 *   1. ANTHROPIC_BASE_URL + Anthropic auth -> firstParty (custom endpoint)
 *   2. CLAUDE_CODE_USE_OPENAI=1 -> openai
 *   3. OPENAI_API_KEY without ANTHROPIC_API_KEY -> openai
 *   4. default -> firstParty
 */
export function getAPIProvider(): APIProvider {
  // If ANTHROPIC_BASE_URL is set with any Anthropic auth, use firstParty
  const hasAnthropicAuth =
    !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN
  const hasAnthropicBase = !!process.env.ANTHROPIC_BASE_URL

  if (hasAnthropicBase && hasAnthropicAuth) {
    return 'firstParty'
  }

  // Explicit OpenAI override
  if (process.env.CLAUDE_CODE_USE_OPENAI === '1') return 'openai'

  // OpenAI key without Anthropic key -> openai
  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return 'openai'
  }

  return 'firstParty'
}

/**
 * Check if using the first-party Anthropic base URL
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  return getAPIProvider() === 'firstParty'
}

/**
 * Check if using OpenAI provider
 */
export function isOpenAIProvider(): boolean {
  return getAPIProvider() === 'openai'
}
