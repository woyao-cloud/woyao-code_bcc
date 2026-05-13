/**
 * Provider selection for the mini CLI
 * Mini version only supports firstParty Anthropic API.
 */

export type APIProvider = 'firstParty'

/**
 * Get the API provider - always firstParty for mini version
 */
export function getAPIProvider(): APIProvider {
  return 'firstParty'
}

/**
 * Check if using the first-party Anthropic base URL
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  return true
}
