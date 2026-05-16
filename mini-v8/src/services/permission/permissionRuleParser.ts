export type RuleBehavior = 'allow' | 'deny' | 'ask'

export interface PermissionRule {
  id: string
  toolName: string
  pattern: string
  behavior: RuleBehavior
  source: string
}

export interface ParseResult {
  success: boolean
  rule?: PermissionRule
  error?: string
}

/**
 * Parse a permission rule string into a structured rule.
 *
 * Format: <behavior>: <toolName>(<pattern>)
 * Examples:
 *   "allow: Bash(git *)"       — Allow all git commands in Bash
 *   "deny: Bash(rm *)"         — Deny rm commands
 *   "ask: Write(config/*)"     — Ask for writes to config dir
 *   "deny: Write"              — Deny all Write operations
 */
export function parsePermissionRule(
  input: string,
  options?: { source?: string },
): ParseResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return { success: false, error: 'Empty rule' }
  }

  const behaviorMatch = trimmed.match(/^(allow|deny|ask):\s*(.+)$/i)
  if (!behaviorMatch) {
    return {
      success: false,
      error: 'Invalid format. Use "behavior: ToolName(pattern)"',
    }
  }

  const behavior = behaviorMatch[1].toLowerCase() as RuleBehavior
  const rest = behaviorMatch[2].trim()

  const parenMatch = rest.match(/^(\w+)\((.+)\)$/)
  let toolName: string
  let pattern: string

  if (parenMatch) {
    toolName = parenMatch[1]
    pattern = parenMatch[2].trim()
    if (!pattern.endsWith('*')) {
      // If no wildcard, make it an exact match by wrapping
    }
  } else if (/^\w+$/.test(rest)) {
    toolName = rest
    pattern = '*'
  } else {
    return {
      success: false,
      error: `Cannot parse: "${rest}". Use "ToolName(pattern)" or "ToolName"`,
    }
  }

  return {
    success: true,
    rule: {
      id: `${behavior}_${toolName}_${pattern}_${Date.now()}`,
      toolName,
      pattern,
      behavior,
      source: options?.source ?? 'manual',
    },
  }
}

/**
 * Check if a pattern matches a given input string.
 * Supports wildcards: * matches anything, ? matches single char.
 */
export function matchGlobPattern(pattern: string, value: string): boolean {
  if (pattern === '*') return true

  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  try {
    return new RegExp(`^${regexStr}$`).test(value)
  } catch {
    return false
  }
}

/**
 * Check if a rule matches a given tool use.
 * For Bash, checks if the command matches the pattern.
 * For other tools, checks if the input matches.
 */
export function ruleMatchesToolUse(
  rule: PermissionRule,
  toolName: string,
  input: Record<string, unknown>,
): boolean {
  if (rule.toolName !== toolName && rule.toolName !== '*') {
    return false
  }

  if (rule.pattern === '*') return true

  // For Bash, match against the command string
  if (toolName === 'Bash' && typeof input.command === 'string') {
    return matchGlobPattern(rule.pattern, input.command)
  }

  // For Write/Edit, match against file_path
  if (
    ['Write', 'Edit', 'ApplyPatch'].includes(toolName) &&
    typeof input.file_path === 'string'
  ) {
    return matchGlobPattern(rule.pattern, input.file_path)
  }

  // For other tools, match against JSON-serialized input
  const inputStr = JSON.stringify(input)
  return matchGlobPattern(rule.pattern, inputStr)
}
