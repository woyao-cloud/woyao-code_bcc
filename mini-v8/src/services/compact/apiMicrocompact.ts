/**
 * API-side microcompact — delegates tool result clearing to the Anthropic API
 * via the context_management parameter. This avoids client-side message
 * manipulation and preserves prompt cache hits.
 *
 * Docs: https://docs.anthropic.com/en/docs/build-with-claude/context-management
 */

// Default thresholds matching client-side microcompact token values
const DEFAULT_MAX_INPUT_TOKENS = 180_000
const DEFAULT_TARGET_INPUT_TOKENS = 40_000

// Tools whose results are eligible for server-side clearing
const TOOLS_CLEARABLE_RESULTS = [
  'Bash',
  'PowerShell',
  'Glob',
  'Grep',
  'Read',
  'WebFetch',
  'WebSearch',
]

export type ContextEditStrategy = {
  type: 'clear_tool_uses_20250919'
  trigger?: {
    type: 'input_tokens'
    value: number
  }
  keep?: {
    type: 'tool_uses'
    value: number
  }
  clear_tool_inputs?: boolean | string[]
  exclude_tools?: string[]
  clear_at_least?: {
    type: 'input_tokens'
    value: number
  }
}

export type ContextManagementConfig = {
  edits: ContextEditStrategy[]
}

/**
 * Build the context_management config for the Anthropic API.
 * Returns undefined when no strategies apply (e.g. env var opt-out).
 */
export function getAPIContextManagement(): ContextManagementConfig | undefined {
  const useClearToolResults =
    process.env.USE_API_CLEAR_TOOL_RESULTS !== undefined
      ? process.env.USE_API_CLEAR_TOOL_RESULTS !== '0' &&
        process.env.USE_API_CLEAR_TOOL_RESULTS !== 'false'
      : true

  if (!useClearToolResults) {
    return undefined
  }

  const triggerThreshold = process.env.API_MAX_INPUT_TOKENS
    ? parseInt(process.env.API_MAX_INPUT_TOKENS, 10)
    : DEFAULT_MAX_INPUT_TOKENS
  const keepTarget = process.env.API_TARGET_INPUT_TOKENS
    ? parseInt(process.env.API_TARGET_INPUT_TOKENS, 10)
    : DEFAULT_TARGET_INPUT_TOKENS

  return {
    edits: [
      {
        type: 'clear_tool_uses_20250919',
        trigger: {
          type: 'input_tokens',
          value: triggerThreshold,
        },
        clear_at_least: {
          type: 'input_tokens',
          value: Math.max(0, triggerThreshold - keepTarget),
        },
        clear_tool_inputs: TOOLS_CLEARABLE_RESULTS,
      },
    ],
  }
}
