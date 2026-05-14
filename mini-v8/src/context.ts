import { loadClaudeMdFiles } from './utils/claudemd.js'
import { getGitStatus, GitStatus } from './utils/git.js'
import { getCwd } from './bootstrap/state.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  discoverSkills,
  formatSkillsForPrompt,
} from './services/skill/skillLoader.js'
import { formatMemoriesForPrompt } from './services/memory/memoryStore.js'
import {
  getSessionId,
  getSessionMemoryForPrompt,
  shouldInjectSessionMemoryIntoPrompt,
  type SessionMemoryPromptMode,
} from './services/memory/sessionMemory.js'
import { getAgentsForPrompt } from './agents/agentRegistry.js'
import { getTeamsForPrompt } from './agents/teamManager.js'

// ============================================================================
// Context Types
// ============================================================================

export interface ContextConfig {
  includeDate?: boolean
  includeWorkingDirectory?: boolean
  includeGit?: boolean
  includeClaudeMd?: boolean
  includeSkills?: boolean
  includeMemories?: boolean
  includeAgents?: boolean
  includeTeams?: boolean
  includeEnvironment?: boolean
  sessionMemoryMode?: SessionMemoryPromptMode
  sessionMemoryPromptMaxChars?: number
  sessionMemoryPromptMaxNotesPerCategory?: number
  conversationMessages?: BetaMessageParam[]
  maxClaudeMdFiles?: number
  maxClaudeMdContentLength?: number
}

export interface ContextParts {
  date?: string
  workingDirectory?: string
  git?: string
  claudeMd?: string[]
  skills?: string
  memories?: string
  sessionMemory?: string
  agents?: string
  teams?: string
  environment?: string
}

export interface EnhancedContext {
  fullContext: string
  parts: ContextParts
  gitStatus?: GitStatus
  timestamp: Date
}

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  includeDate: true,
  includeWorkingDirectory: true,
  includeGit: true,
  includeClaudeMd: true,
  includeSkills: true,
  includeMemories: true,
  includeAgents: true,
  includeTeams: true,
  includeEnvironment: false,
  sessionMemoryMode: 'auto',
  sessionMemoryPromptMaxChars: 900,
  sessionMemoryPromptMaxNotesPerCategory: 3,
  maxClaudeMdFiles: 3,
  maxClaudeMdContentLength: 2000,
}

// ============================================================================
// System Context
// ============================================================================

export async function getSystemContext(
  skillContextOverride?: string,
  config: Partial<ContextConfig> = {},
): Promise<string> {
  const mergedConfig = { ...DEFAULT_CONTEXT_CONFIG, ...config }
  const cwd = getCwd()
  const parts: string[] = []

  // Date/time
  if (mergedConfig.includeDate) {
    parts.push(`Current date: ${new Date().toISOString().split('T')[0]}`)
  }

  // Working directory
  if (mergedConfig.includeWorkingDirectory) {
    parts.push(`Working directory: ${cwd}`)
  }

  // Git context - enhanced with comprehensive status
  if (mergedConfig.includeGit) {
    const gitStatus = await getGitStatus(cwd)
    if (gitStatus.isGit) {
      const gitParts: string[] = []
      if (gitStatus.branch) {
        gitParts.push(`Branch: ${gitStatus.branch}`)
      }
      if (gitStatus.shortCommit) {
        gitParts.push(`Commit: ${gitStatus.shortCommit}`)
      }
      if (gitStatus.ahead > 0 || gitStatus.behind > 0) {
        gitParts.push(`Ahead: ${gitStatus.ahead}, Behind: ${gitStatus.behind}`)
      }
      if (!gitStatus.isClean) {
        const statusParts: string[] = []
        if (gitStatus.hasStagedChanges) statusParts.push('staged changes')
        if (gitStatus.hasUnstagedChanges) statusParts.push('unstaged changes')
        if (gitStatus.hasUntrackedFiles) statusParts.push('untracked files')
        gitParts.push(`Status: ${statusParts.join(', ')}`)
      }
      if (gitStatus.hasUnpushedCommits) {
        gitParts.push('Has unpushed commits')
      }
      if (gitParts.length > 0) {
        parts.push(`Git: ${gitParts.join('; ')}`)
      }
    }
  }

  // CLAUDE.md / AGENTS.md files
  if (mergedConfig.includeClaudeMd) {
    const claudeMdFiles = loadClaudeMdFiles(cwd)
    if (claudeMdFiles.length > 0) {
      for (const file of claudeMdFiles.slice(
        0,
        mergedConfig.maxClaudeMdFiles,
      )) {
        parts.push(
          `Contents of ${file.path}:\n${file.content.slice(
            0,
            mergedConfig.maxClaudeMdContentLength,
          )}`,
        )
      }
    }
  }

  // Skills (use override if provided, else compute)
  if (mergedConfig.includeSkills) {
    if (skillContextOverride !== undefined) {
      if (skillContextOverride) parts.push(skillContextOverride)
    } else {
      const skillsText = formatSkillsForPrompt(discoverSkills(cwd))
      if (skillsText) parts.push(skillsText)
    }
  }

  // Memories
  if (mergedConfig.includeMemories) {
    const memoriesText = formatMemoriesForPrompt()
    if (memoriesText) parts.push(memoriesText)
  }

  if (mergedConfig.sessionMemoryMode !== 'never') {
    const sessionMemoryText = getSessionMemoryContext(mergedConfig)
    if (sessionMemoryText) parts.push(sessionMemoryText)
  }

  // Agents
  if (mergedConfig.includeAgents) {
    const agentsText = getAgentsForPrompt()
    if (agentsText) parts.push(agentsText)
  }

  // Active teams
  if (mergedConfig.includeTeams) {
    const teamsText = getTeamsForPrompt()
    if (teamsText) parts.push(teamsText)
  }

  // Environment variables
  if (mergedConfig.includeEnvironment) {
    const envText = getEnvironmentContext()
    if (envText) parts.push(envText)
  }

  return parts.join('\n\n')
}

// ============================================================================
// Enhanced Context with Parts
// ============================================================================

export async function getEnhancedContext(
  skillContextOverride?: string,
  config: Partial<ContextConfig> = {},
): Promise<EnhancedContext> {
  const mergedConfig = { ...DEFAULT_CONTEXT_CONFIG, ...config }
  const cwd = getCwd()
  const parts: ContextParts = {}
  let gitStatus: GitStatus | undefined

  // Date/time
  if (mergedConfig.includeDate) {
    parts.date = `Current date: ${new Date().toISOString().split('T')[0]}`
  }

  // Working directory
  if (mergedConfig.includeWorkingDirectory) {
    parts.workingDirectory = `Working directory: ${cwd}`
  }

  // Git context
  if (mergedConfig.includeGit) {
    gitStatus = await getGitStatus(cwd)
    if (gitStatus.isGit) {
      const gitParts: string[] = []
      if (gitStatus.branch) gitParts.push(`Branch: ${gitStatus.branch}`)
      if (gitStatus.shortCommit)
        gitParts.push(`Commit: ${gitStatus.shortCommit}`)
      if (gitStatus.ahead > 0 || gitStatus.behind > 0) {
        gitParts.push(`Ahead: ${gitStatus.ahead}, Behind: ${gitStatus.behind}`)
      }
      if (!gitStatus.isClean) {
        const statusParts: string[] = []
        if (gitStatus.hasStagedChanges) statusParts.push('staged changes')
        if (gitStatus.hasUnstagedChanges) statusParts.push('unstaged changes')
        if (gitStatus.hasUntrackedFiles) statusParts.push('untracked files')
        gitParts.push(`Status: ${statusParts.join(', ')}`)
      }
      if (gitStatus.hasUnpushedCommits) {
        gitParts.push('Has unpushed commits')
      }
      parts.git =
        gitParts.length > 0 ? `Git: ${gitParts.join('; ')}` : undefined
    }
  }

  // CLAUDE.md files
  if (mergedConfig.includeClaudeMd) {
    const claudeMdFiles = loadClaudeMdFiles(cwd)
    if (claudeMdFiles.length > 0) {
      parts.claudeMd = claudeMdFiles
        .slice(0, mergedConfig.maxClaudeMdFiles)
        .map(
          file =>
            `Contents of ${file.path}:\n${file.content.slice(
              0,
              mergedConfig.maxClaudeMdContentLength,
            )}`,
        )
    }
  }

  // Skills
  if (mergedConfig.includeSkills) {
    if (skillContextOverride !== undefined) {
      parts.skills = skillContextOverride || undefined
    } else {
      parts.skills = formatSkillsForPrompt(discoverSkills(cwd)) || undefined
    }
  }

  // Memories
  if (mergedConfig.includeMemories) {
    parts.memories = formatMemoriesForPrompt() || undefined
  }

  if (mergedConfig.sessionMemoryMode !== 'never') {
    parts.sessionMemory = getSessionMemoryContext(mergedConfig) || undefined
  }

  // Agents
  if (mergedConfig.includeAgents) {
    parts.agents = getAgentsForPrompt() || undefined
  }

  // Teams
  if (mergedConfig.includeTeams) {
    parts.teams = getTeamsForPrompt() || undefined
  }

  // Environment
  if (mergedConfig.includeEnvironment) {
    parts.environment = getEnvironmentContext() || undefined
  }

  // Build full context
  const fullContext = Object.values(parts)
    .filter(p => p !== undefined)
    .flat()
    .join('\n\n')

  return {
    fullContext,
    parts,
    gitStatus,
    timestamp: new Date(),
  }
}

// ============================================================================
// User Context
// ============================================================================

export async function getUserContext(): Promise<string> {
  return ''
}

/**
 * Get user context with additional information
 */
export interface UserContext {
  id?: string
  name?: string
  preferences?: Record<string, unknown>
  roles?: string[]
}

export async function getUserContextObject(): Promise<UserContext> {
  return {}
}

function getSessionMemoryContext(config: ContextConfig): string {
  const sessionId = getSessionId()
  if (!sessionId) {
    return ''
  }

  if (
    !shouldInjectSessionMemoryIntoPrompt(
      config.conversationMessages,
      config.sessionMemoryMode ?? 'auto',
    )
  ) {
    return ''
  }

  return getSessionMemoryForPrompt(sessionId, {
    maxChars: config.sessionMemoryPromptMaxChars,
    maxNotesPerCategory: config.sessionMemoryPromptMaxNotesPerCategory,
  })
}

// ============================================================================
// Git Context
// ============================================================================

/**
 * Get detailed git context for use in prompts
 */
export async function getGitContext(): Promise<string> {
  const cwd = getCwd()
  const gitStatus = await getGitStatus(cwd)

  if (!gitStatus.isGit) {
    return 'Not in a git repository'
  }

  const parts: string[] = []
  parts.push(`Git Repository: ${gitStatus.root}`)

  if (gitStatus.branch) {
    parts.push(`Branch: ${gitStatus.branch}`)
  }
  if (gitStatus.defaultBranch && gitStatus.defaultBranch !== gitStatus.branch) {
    parts.push(`Default Branch: ${gitStatus.defaultBranch}`)
  }
  if (gitStatus.commit) {
    parts.push(`Commit: ${gitStatus.commit}`)
  }
  if (gitStatus.remoteUrl) {
    parts.push(`Remote: ${gitStatus.normalizedRemoteUrl}`)
  }
  parts.push(`Working Tree: ${gitStatus.isClean ? 'Clean' : 'Dirty'}`)

  if (gitStatus.hasStagedChanges) {
    parts.push('- Has staged changes')
  }
  if (gitStatus.hasUnstagedChanges) {
    parts.push('- Has unstaged changes')
  }
  if (gitStatus.hasUntrackedFiles) {
    parts.push('- Has untracked files')
  }
  if (gitStatus.ahead > 0) {
    parts.push(`- ${gitStatus.ahead} commits ahead of origin`)
  }
  if (gitStatus.behind > 0) {
    parts.push(`- ${gitStatus.behind} commits behind origin`)
  }
  if (gitStatus.hasUnpushedCommits) {
    parts.push('- Has unpushed commits')
  }

  return parts.join('\n')
}

/**
 * Get git status object for programmatic use
 */
export async function getGitStatusObject(): Promise<{
  isGit: boolean
  branch: string | null
  commit: string | null
  isClean: boolean
  hasChanges: boolean
  ahead: number
  behind: number
}> {
  const cwd = getCwd()
  const gitStatus = await getGitStatus(cwd)

  return {
    isGit: gitStatus.isGit,
    branch: gitStatus.branch,
    commit: gitStatus.commit,
    isClean: gitStatus.isClean,
    hasChanges: !gitStatus.isClean,
    ahead: gitStatus.ahead,
    behind: gitStatus.behind,
  }
}

// ============================================================================
// Environment Context
// ============================================================================

/**
 * Get environment context for prompts
 */
export function getEnvironmentContext(): string {
  const envVars: string[] = []

  // Collect relevant environment variables
  const relevantVars = [
    'CLAUDE_CODE_DEBUG',
    'CLAUDE_CODE_USE_OPENAI',
    'ANTHROPIC_MODEL',
    'OPENAI_MODEL',
    'NODE_ENV',
    'PATH',
  ]

  for (const key of relevantVars) {
    const value = process.env[key]
    if (value !== undefined) {
      // Hide sensitive values
      if (
        key.includes('KEY') ||
        key.includes('TOKEN') ||
        key.includes('SECRET')
      ) {
        envVars.push(`${key}: [REDACTED]`)
      } else if (key === 'PATH' && value.length > 100) {
        envVars.push(`${key}: ${value.slice(0, 100)}...`)
      } else {
        envVars.push(`${key}: ${value}`)
      }
    }
  }

  if (envVars.length === 0) {
    return ''
  }

  return `Environment:\n${envVars.join('\n')}`
}

/**
 * Get environment variables as object
 */
export function getEnvironmentVariables(): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith('CLAUDE_CODE_') ||
      key.startsWith('ANTHROPIC_') ||
      key.startsWith('OPENAI_')
    ) {
      result[key] = process.env[key] || ''
    }
  }
  return result
}

// ============================================================================
// Context Helpers
// ============================================================================

/**
 * Get context summary - brief overview of current state
 */
export async function getContextSummary(): Promise<string> {
  const cwd = getCwd()
  const gitStatus = await getGitStatus(cwd)
  const parts: string[] = []

  parts.push(`Directory: ${cwd}`)

  if (gitStatus.isGit) {
    parts.push(
      `Git: ${gitStatus.branch || 'unknown'}${gitStatus.isClean ? ' (clean)' : ' (dirty)'}`,
    )
  }

  const claudeMdFiles = loadClaudeMdFiles(cwd)
  if (claudeMdFiles.length > 0) {
    parts.push(`Project files: ${claudeMdFiles.length}`)
  }

  return parts.join(' | ')
}

/**
 * Check if context has significant changes requiring attention
 */
export interface ContextAlert {
  type: 'warning' | 'info' | 'error'
  message: string
  detail?: string
}

export async function getContextAlerts(): Promise<ContextAlert[]> {
  const alerts: ContextAlert[] = []
  const cwd = getCwd()
  const gitStatus = await getGitStatus(cwd)

  if (gitStatus.isGit) {
    if (gitStatus.hasUnpushedCommits && gitStatus.ahead > 0) {
      alerts.push({
        type: 'warning',
        message: 'Unpushed commits',
        detail: `${gitStatus.ahead} commits ahead of origin`,
      })
    }

    if (gitStatus.behind > 10) {
      alerts.push({
        type: 'warning',
        message: 'Significantly behind origin',
        detail: `${gitStatus.behind} commits behind`,
      })
    }

    if (!gitStatus.isClean && gitStatus.hasUntrackedFiles) {
      alerts.push({
        type: 'info',
        message: 'Untracked files present',
      })
    }
  }

  return alerts
}
