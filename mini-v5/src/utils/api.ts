import type { Tool } from '../Tool.js'

/**
 * Convert tool to its API schema representation
 */
export function toolToAPISchema(tool: Tool): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }
}

/**
 * Split a system prompt into cacheable prefix and non-cacheable suffix
 */
export function splitSysPromptPrefix(prompt: string): {
  prefix: string
  suffix: string
} {
  const lastNewline = prompt.lastIndexOf('\n', prompt.length - 100)
  if (lastNewline < 0) {
    return { prefix: '', suffix: prompt }
  }
  return {
    prefix: prompt.slice(0, lastNewline),
    suffix: prompt.slice(lastNewline),
  }
}

/**
 * Log API request prefix
 */
export function logAPIPrefix(
  model: string,
  inputTokens: number,
  provider: string,
): void {
  // Mini version: no-op or simple stderr logging in verbose mode
}
