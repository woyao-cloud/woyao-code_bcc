/**
 * System prompt type for the mini CLI
 */
export interface SystemPrompt {
  /** Full system prompt text */
  prompt: string
  /** System prompt parts for cache breakpoints */
  parts: SystemPromptPart[]
}

export interface SystemPromptPart {
  /** Content of this part */
  text: string
  /** Whether this part is cacheable */
  cacheable: boolean
}

/**
 * Wrap a plain string as a SystemPrompt
 */
export function asSystemPrompt(text: string): SystemPrompt {
  return {
    prompt: text,
    parts: [{ text, cacheable: false }],
  }
}
