/**
 * Provider selection for mini-v2.
 * Supports Anthropic firstParty and OpenAI-compatible APIs.
 */

export type APIProvider = 'firstParty' | 'openai'

/**
 * Get the API provider based on environment variables.
 * Priority: CLAUDE_CODE_USE_OPENAI=1 -> openai, otherwise firstParty
 */
export function getAPIProvider(): APIProvider {
  if (process.env.CLAUDE_CODE_USE_OPENAI === '1') return 'openai'
  if (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)
    return 'openai'
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
