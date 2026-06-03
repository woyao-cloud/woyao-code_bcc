import type { AgentId, SessionId } from './ids.js'

// ============================================================
// Permission types
// ============================================================

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'dontAsk'
  | 'plan'

export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export type PermissionRuleValue = {
  toolName: string
  ruleContent?: string
}

export type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg'

export type PermissionUpdate =
  | {
      type: 'addRules'
      destination: PermissionUpdateDestination
      rules: PermissionRuleValue[]
      behavior: PermissionBehavior
    }
  | {
      type: 'setMode'
      destination: PermissionUpdateDestination
      mode: PermissionMode
    }
  | {
      type: 'addDirectories'
      destination: PermissionUpdateDestination
      directories: string[]
    }

export type AdditionalWorkingDirectory = {
  path: string
  source: string
}

export type ToolPermissionRulesBySource = Record<string, string[]>

export type ToolPermissionContext = {
  readonly mode: PermissionMode
  readonly additionalWorkingDirectories: ReadonlyMap<
    string,
    AdditionalWorkingDirectory
  >
  readonly alwaysAllowRules: ToolPermissionRulesBySource
  readonly alwaysDenyRules: ToolPermissionRulesBySource
  readonly isBypassPermissionsModeAvailable: boolean
  /** When true, permission prompts are auto-denied (e.g., background agents) */
  readonly shouldAvoidPermissionPrompts?: boolean
  /** When true, automated checks are awaited before dialog */
  readonly awaitAutomatedChecksBeforeDialog?: boolean
  /** Permission mode before plan mode entry, restored on exit */
  readonly prePlanMode?: PermissionMode
  readonly alwaysAskRules?: ToolPermissionRulesBySource
  readonly strippedDangerousRules?: ToolPermissionRulesBySource
  readonly isAutoModeAvailable?: boolean
}

export function getEmptyToolPermissionContext(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

export type PermissionResult =
  | {
      behavior: 'allow'
      updatedInput: Record<string, unknown>
      rationale?: string
    }
  | { behavior: 'deny'; rationale?: string }

// Re-export IDs
export type { AgentId, SessionId }
