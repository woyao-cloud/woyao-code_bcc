import type { Tool } from '../../Tool.js'
import type { PermissionMode } from '../../types/permissions.js'
import {
  parsePermissionRule,
  ruleMatchesToolUse,
  type PermissionRule,
  type RuleBehavior,
} from './permissionRuleParser.js'

export type { PermissionRule, RuleBehavior }

export interface PermissionContext {
  mode: PermissionMode
  rules: PermissionRule[]
  tool: Tool
  input: Record<string, unknown>
}

export interface PermissionDecision {
  behavior: RuleBehavior
  rule?: PermissionRule
  reason: string
}

/**
 * Core permission evaluator.
 * Evaluates rules in priority order: deny → allow → ask → mode default.
 */
export function hasPermissionsToUseTool(
  context: PermissionContext,
): PermissionDecision {
  const { mode, rules, tool, input } = context

  // 1. Bypass mode: everything allowed
  if (mode === 'bypassPermissions' || mode === 'dontAsk') {
    return { behavior: 'allow', reason: 'Bypass mode' }
  }

  // 2. Plan mode: allow reads, deny writes
  if (mode === 'plan') {
    if (tool.isReadOnly?.(input)) {
      return { behavior: 'allow', reason: 'Plan mode: read-only allowed' }
    }
    return { behavior: 'deny', reason: 'Plan mode: write operations denied' }
  }

  // 3. Evaluate explicit rules in priority order
  const denyRules = rules.filter(r => r.behavior === 'deny')
  const allowRules = rules.filter(r => r.behavior === 'allow')
  const askRules = rules.filter(r => r.behavior === 'ask')

  for (const rule of denyRules) {
    if (ruleMatchesToolUse(rule, tool.name, input)) {
      return {
        behavior: 'deny',
        rule,
        reason: `Matched deny rule: ${rule.toolName}(${rule.pattern})`,
      }
    }
  }

  for (const rule of allowRules) {
    if (ruleMatchesToolUse(rule, tool.name, input)) {
      return {
        behavior: 'allow',
        rule,
        reason: `Matched allow rule: ${rule.toolName}(${rule.pattern})`,
      }
    }
  }

  for (const rule of askRules) {
    if (ruleMatchesToolUse(rule, tool.name, input)) {
      return {
        behavior: 'ask',
        rule,
        reason: `Matched ask rule: ${rule.toolName}(${rule.pattern})`,
      }
    }
  }

  // 4. Mode-specific default behavior
  if (mode === 'acceptEdits') {
    if (['Write', 'Edit', 'ApplyPatch'].includes(tool.name)) {
      return {
        behavior: 'allow',
        reason: 'AcceptEdits mode: file edits allowed',
      }
    }
  }

  // 5. Default: ask for destructive tools, allow for read-only
  if (tool.isDestructive?.(input)) {
    return { behavior: 'ask', reason: 'Destructive tool requires confirmation' }
  }

  if (tool.isReadOnly?.(input)) {
    return { behavior: 'allow', reason: 'Read-only tool' }
  }

  return { behavior: 'ask', reason: 'Default: ask for non-read-only tools' }
}
