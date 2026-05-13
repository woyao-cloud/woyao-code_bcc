/**
 * Get the API key from environment variables.
 * Checks both Anthropic and OpenAI keys based on configured provider.
 */

export function getAPIKey(): string | undefined {
  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY

  // If CLAUDE_CODE_USE_OPENAI is set, prefer OpenAI key
  if (process.env.CLAUDE_CODE_USE_OPENAI === '1') {
    return openaiKey || anthropicKey
  }

  // If only OpenAI key is set (no Anthropic key), use it
  if (!anthropicKey && openaiKey) {
    return openaiKey
  }

  return anthropicKey
}

/**
 * Check if we have an API key configured
 */
export function hasAPIKey(): boolean {
  const key = getAPIKey()
  return key !== undefined && key.length > 0
}
