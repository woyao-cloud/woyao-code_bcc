/**
 * Get the API key from environment variables
 */
export function getAPIKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY
}

/**
 * Check if we have an API key configured
 */
export function hasAPIKey(): boolean {
  const key = getAPIKey()
  return key !== undefined && key.length > 0
}
