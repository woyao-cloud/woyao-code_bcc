/**
 * Provider selection for mini-v5.
 * Supports Anthropic firstParty and OpenAI-compatible APIs.
 */

export type APIProvider = 'firstParty' | 'openai'

/**
 * Get the API provider based on environment variables.
 * Priority:
 *   1. CLAUDE_CODE_USE_OPENAI=1 -> openai
 *   2. ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN -> firstParty (custom endpoint)
 *   3. ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY -> firstParty (custom endpoint)
 *   4. OPENAI_API_KEY without ANTHROPIC_API_KEY -> openai
 *   5. default -> firstParty
 */
export function getAPIProvider(): APIProvider {
  // Explicit override
  if (process.env.CLAUDE_CODE_USE_OPENAI === '1') return 'openai'

  // If ANTHROPIC_BASE_URL is set with any Anthropic auth, use firstParty
  const hasAnthropicAuth =
    !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN
  const hasAnthropicBase = !!process.env.ANTHROPIC_BASE_URL

  if (hasAnthropicBase && hasAnthropicAuth) {
    return 'firstParty'
  }

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
