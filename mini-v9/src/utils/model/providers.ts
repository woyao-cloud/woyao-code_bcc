/**
 * Provider selection for mini-v5.
 * Supports Anthropic firstParty, OpenAI-compatible, and Gemini APIs.
 *
 * Auto-detection: when no provider is explicitly configured via env vars,
 * mini-v8 will check if a local Ollama instance is reachable and default
 * to it, providing a zero-config experience.
 */

export type APIProvider = 'firstParty' | 'openai' | 'gemini'

// Module-level auto-detection cache. Set by detectOllama() early in startup.
let autoDetectedProvider: APIProvider | null = null

/**
 * Set an auto-detected provider override.
 * Called during startup in cli.ts main() after Ollama reachability check.
 * This allows synchronous getAPIProvider() to return the detected value.
 */
export function setAutoDetectedProvider(p: APIProvider | null): void {
  autoDetectedProvider = p
}

/**
 * Get the API provider based on environment variables.
 * Priority:
 *   1. ANTHROPIC_BASE_URL + Anthropic auth -> firstParty (custom endpoint)
 *   2. CLAUDE_CODE_USE_GEMINI=1 -> gemini
 *   3. CLAUDE_CODE_USE_OPENAI=1 -> openai
 *   4. GEMINI_API_KEY without other keys -> gemini
 *   5. OPENAI_API_KEY without ANTHROPIC_API_KEY -> openai
 *   6. auto-detected Ollama (if reachable) -> openai
 *   7. default -> firstParty
 */
export function getAPIProvider(): APIProvider {
  
 if (process.env.CLAUDE_CODE_USE_OPENAI === '1') return 'openai'
  const hasAnthropicAuth =
    !!process.env.ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_AUTH_TOKEN
  const hasAnthropicBase = !!process.env.ANTHROPIC_BASE_URL

  if (hasAnthropicBase && hasAnthropicAuth) {
    return 'firstParty'
  }

  if (process.env.CLAUDE_CODE_USE_GEMINI === '1') return 'gemini'

 

  

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

  // Auto-detected override (set by detectOllama() in main())
  if (autoDetectedProvider) return autoDetectedProvider

  return 'firstParty'
}

/**
 * Check if a local Ollama instance is reachable.
 * Attempts to fetch the Ollama tags endpoint with a short timeout.
 * Caches the result so subsequent calls are instant.
 */
let ollamaReachable: boolean | null = null

export async function detectOllama(): Promise<boolean> {
  if (ollamaReachable !== null) return ollamaReachable

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 500)

    const res = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    ollamaReachable = res.ok
  } catch {
    ollamaReachable = false
  }

  return ollamaReachable
}

/**
 * Whether Ollama was auto-detected (reachable and no explicit provider set).
 */
export function isOllamaAutoDetected(): boolean {
  return autoDetectedProvider !== null
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
