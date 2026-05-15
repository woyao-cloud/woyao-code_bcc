import { loadClaudeMdFiles } from './utils/claudemd.js'
import { getGitStatus, GitStatus } from './utils/git.js'
import { getCwd } from './bootstrap/state.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import {
  discoverSkills,
  formatSkillsForPrompt,
  type Skill,
} from './services/skill/skillLoader.js'
import { formatMemoriesForPromptWithOptions } from './services/memory/memoryStore.js'
import {
  getSessionId,
  getSessionMemoryForPrompt,
  hasSessionMemoryCompactionSummary,
  shouldInjectSessionMemoryIntoPrompt,
  type SessionMemoryPromptMode,
} from './services/memory/sessionMemory.js'
import { getAgentsForPromptWithOptions } from './agents/agentRegistry.js'
import { getTeamsForPromptWithOptions } from './agents/teamManager.js'
import { getTeamMemoryForPromptWithOptions } from './services/memory/teamMemorySync.js'
import { getSystemContextCacheRevision } from './services/context/contextCacheState.js'

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
  includeTeamMemory?: boolean
  sessionMemoryMode?: SessionMemoryPromptMode
  sessionMemoryPromptMaxChars?: number
  sessionMemoryPromptMaxNotesPerCategory?: number
  conversationMessages?: BetaMessageParam[]
  maxContextTokens?: number
  maxMemoriesInPrompt?: number
  maxMemoryPromptChars?: number
  maxTeamMemoryPromptChars?: number
  maxSkillsInPrompt?: number
  maxAgentsInPrompt?: number
  maxTeamsInPrompt?: number
  includeSkillsOnlyWhenRelevant?: boolean
  includeAgentsOnlyWhenRelevant?: boolean
  includeTeamsOnlyWhenRelevant?: boolean
  includeMemoriesOnlyWhenRelevant?: boolean
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
  teamMemory?: string
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
  includeTeamMemory: false,
  includeEnvironment: false,
  sessionMemoryMode: 'auto',
  sessionMemoryPromptMaxChars: 900,
  sessionMemoryPromptMaxNotesPerCategory: 3,
  maxContextTokens: 3000,
  maxMemoriesInPrompt: 4,
  maxMemoryPromptChars: 700,
  maxTeamMemoryPromptChars: 700,
  maxSkillsInPrompt: 8,
  maxAgentsInPrompt: 8,
  maxTeamsInPrompt: 4,
  includeSkillsOnlyWhenRelevant: true,
  includeAgentsOnlyWhenRelevant: true,
  includeTeamsOnlyWhenRelevant: true,
  includeMemoriesOnlyWhenRelevant: true,
  maxClaudeMdFiles: 3,
  maxClaudeMdContentLength: 2000,
}

interface ContextBlock {
  key: keyof ContextParts
  text: string
  priority: number
  optional?: boolean
  minTokens?: number
  renderToFit?: (remainingTokens: number) => string | undefined
}

interface CachedEnhancedContextEntry {
  expiresAt: number
  value: EnhancedContext
}

const CONTEXT_CACHE_TTL_MS = 15_000
const MAX_ENHANCED_CONTEXT_CACHE_ENTRIES = 24

let cachedClaudeMdKey = ''
let cachedClaudeMdBlocks: string[] = []
let cachedSkillsKey = ''
let cachedSkillsText = ''
let cachedEnhancedContexts = new Map<string, CachedEnhancedContextEntry>()
let localContextCacheRevision = -1
const MEMORY_LIKE_CONTEXT_MIN_TOKENS = 24

// ============================================================================
// System Context
// ============================================================================

export async function getSystemContext(
  skillContextOverride?: string,
  config: Partial<ContextConfig> = {},
): Promise<string> {
  const mergedConfig = { ...DEFAULT_CONTEXT_CONFIG, ...config }
  const { fullContext } = await getEnhancedContext(
    skillContextOverride,
    mergedConfig,
  )
  return fullContext
}

// ============================================================================
// Enhanced Context with Parts
// ============================================================================

export async function getEnhancedContext(
  skillContextOverride?: string,
  config: Partial<ContextConfig> = {},
): Promise<EnhancedContext> {
  const mergedConfig = { ...DEFAULT_CONTEXT_CONFIG, ...config }
  const contextRevision = syncContextCacheRevision()
  const cwd = getCwd()
  const conversationSignature = buildConversationSignature(
    mergedConfig.conversationMessages,
  )
  const cacheKey = buildEnhancedContextCacheKey({
    cwd,
    skillContextOverride,
    config: mergedConfig,
    conversationSignature,
    revision: contextRevision,
    sessionId: getSessionId(),
  })
  const cached = getCachedEnhancedContext(cacheKey)
  if (cached) {
    return cached
  }
  const candidateParts: ContextParts = {}
  const blocks: ContextBlock[] = []
  let gitStatus: GitStatus | undefined
  const conversationQuery = extractConversationQuery(
    mergedConfig.conversationMessages,
  )
  const conversationHints = buildConversationHints(conversationQuery)

  // Date/time
  if (mergedConfig.includeDate) {
    candidateParts.date = `Current date: ${new Date().toISOString().split('T')[0]}`
    blocks.push({
      key: 'date',
      text: candidateParts.date,
      priority: 100,
    })
  }

  // Working directory
  if (mergedConfig.includeWorkingDirectory) {
    candidateParts.workingDirectory = `Working directory: ${cwd}`
    blocks.push({
      key: 'workingDirectory',
      text: candidateParts.workingDirectory,
      priority: 95,
    })
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
      candidateParts.git =
        gitParts.length > 0 ? `Git: ${gitParts.join('; ')}` : undefined
      if (candidateParts.git) {
        blocks.push({
          key: 'git',
          text: candidateParts.git,
          priority: 90,
        })
      }
    }
  }

  // CLAUDE.md files
  if (mergedConfig.includeClaudeMd) {
    candidateParts.claudeMd = getClaudeMdBlocks(cwd, mergedConfig)
    if (candidateParts.claudeMd.length > 0) {
      for (const text of candidateParts.claudeMd) {
        blocks.push({
          key: 'claudeMd',
          text,
          priority: 85,
          optional: true,
        })
      }
    }
  }

  // Skills
  if (mergedConfig.includeSkills) {
    if (skillContextOverride !== undefined) {
      candidateParts.skills = skillContextOverride || undefined
    } else {
      const skills = discoverSkills(cwd)
      candidateParts.skills = shouldIncludePromptSection(
        'skills',
        mergedConfig.includeSkillsOnlyWhenRelevant,
        conversationHints,
      )
        ? getSkillsPrompt(cwd, skills, mergedConfig)
        : undefined
    }
    if (candidateParts.skills) {
      blocks.push({
        key: 'skills',
        text: candidateParts.skills,
        priority: 40,
        optional: true,
      })
    }
  }

  // Memories
  if (mergedConfig.includeMemories) {
    const shouldIncludeMemories =
      shouldIncludePromptSection(
        'memories',
        mergedConfig.includeMemoriesOnlyWhenRelevant,
        conversationHints,
      ) || !conversationQuery

    if (shouldIncludeMemories) {
      const memoryBlock = buildBudgetedMemoryLikeBlock({
        key: 'memories',
        priority: 55,
        maxChars: mergedConfig.maxMemoryPromptChars,
        minTokens: MEMORY_LIKE_CONTEXT_MIN_TOKENS,
        render: maxChars =>
          formatMemoriesForPromptWithOptions({
            query: conversationQuery,
            limit: mergedConfig.maxMemoriesInPrompt,
            maxChars,
          }) || undefined,
      })
      if (memoryBlock) {
        blocks.push(memoryBlock)
      }
    }
  }

  if (mergedConfig.sessionMemoryMode !== 'never') {
    const sessionMemoryBlock = buildBudgetedSessionMemoryBlock(
      mergedConfig,
      MEMORY_LIKE_CONTEXT_MIN_TOKENS,
    )
    if (sessionMemoryBlock) {
      blocks.push({
        ...sessionMemoryBlock,
      })
    }
  }

  // Agents
  if (mergedConfig.includeAgents) {
    candidateParts.agents = shouldIncludePromptSection(
      'agents',
      mergedConfig.includeAgentsOnlyWhenRelevant,
      conversationHints,
    )
      ? getAgentsForPromptWithOptions({
          limit: mergedConfig.maxAgentsInPrompt,
          query: conversationQuery,
        }) || undefined
      : undefined
    if (candidateParts.agents) {
      blocks.push({
        key: 'agents',
        text: candidateParts.agents,
        priority: 35,
        optional: true,
      })
    }
  }

  // Teams
  if (mergedConfig.includeTeams) {
    candidateParts.teams = shouldIncludePromptSection(
      'teams',
      mergedConfig.includeTeamsOnlyWhenRelevant,
      conversationHints,
    )
      ? getTeamsForPromptWithOptions({
          limit: mergedConfig.maxTeamsInPrompt,
          query: conversationQuery,
        }) || undefined
      : undefined
    if (candidateParts.teams) {
      blocks.push({
        key: 'teams',
        text: candidateParts.teams,
        priority: 30,
        optional: true,
      })
    }
  }

  if (mergedConfig.includeTeamMemory) {
    const shouldIncludeTeamMemory = shouldIncludePromptSection(
      'teams',
      mergedConfig.includeTeamsOnlyWhenRelevant,
      conversationHints,
    )
    if (shouldIncludeTeamMemory) {
      const teamMemoryBlock = buildBudgetedMemoryLikeBlock({
        key: 'teamMemory',
        priority: 50,
        maxChars: mergedConfig.maxTeamMemoryPromptChars,
        minTokens: MEMORY_LIKE_CONTEXT_MIN_TOKENS,
        render: maxChars =>
          getTeamMemoryForPromptWithOptions({
            query: conversationQuery,
            limit: mergedConfig.maxTeamsInPrompt,
            maxChars,
          }) || undefined,
      })
      if (teamMemoryBlock) {
        blocks.push(teamMemoryBlock)
      }
    }
  }

  // Environment
  if (mergedConfig.includeEnvironment) {
    candidateParts.environment = getEnvironmentContext() || undefined
    if (candidateParts.environment) {
      blocks.push({
        key: 'environment',
        text: candidateParts.environment,
        priority: 20,
        optional: true,
      })
    }
  }

  const selectedBlocks = selectContextBlocksForBudget(
    blocks,
    mergedConfig.maxContextTokens ?? DEFAULT_CONTEXT_CONFIG.maxContextTokens!,
  )
  const parts = materializeContextPartsFromBlocks(selectedBlocks)
  const fullContext = selectedBlocks.map(block => block.text).join('\n\n')

  const result: EnhancedContext = {
    fullContext,
    parts,
    gitStatus,
    timestamp: new Date(),
  }

  setCachedEnhancedContext(cacheKey, result)
  return cloneEnhancedContext(result)
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

function getSessionMemoryContext(
  config: ContextConfig,
  maxCharsOverride?: number,
): string {
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
    maxChars: maxCharsOverride ?? config.sessionMemoryPromptMaxChars,
    maxNotesPerCategory: config.sessionMemoryPromptMaxNotesPerCategory,
  })
}

function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function extractConversationQuery(
  messages: BetaMessageParam[] | undefined,
): string {
  if (!messages || messages.length === 0) {
    return ''
  }

  const chunks: string[] = []
  for (let i = messages.length - 1; i >= 0 && chunks.length < 3; i--) {
    const message = messages[i]
    if (!message) continue
    const text = getMessagePromptText(message)
    if (text) {
      chunks.unshift(text)
    }
  }

  return chunks.join(' ').trim()
}

function getMessagePromptText(message: BetaMessageParam): string {
  if (typeof message.content === 'string') {
    return message.content
  }

  if (!Array.isArray(message.content)) {
    return ''
  }

  return message.content
    .map(block => {
      if (
        typeof block === 'object' &&
        block !== null &&
        'text' in block &&
        typeof block.text === 'string'
      ) {
        return block.text
      }
      if (
        typeof block === 'object' &&
        block !== null &&
        'content' in block &&
        typeof block.content === 'string'
      ) {
        return block.content
      }
      return ''
    })
    .join(' ')
}

function buildConversationHints(query: string): Set<string> {
  const lower = query.toLowerCase()
  const hints = new Set<string>()

  if (/\bskill\b|\bskills\b|skill tool|workflow|hook|prompt/i.test(query)) {
    hints.add('skills')
  }
  if (
    /\bagent\b|\bagents\b|\bworker\b|\bcoordinator\b|\bexplore\b|\bplan\b/i.test(
      query,
    )
  ) {
    hints.add('agents')
  }
  if (/\bteam\b|\bswarm\b|\bmembers\b|\bteammate\b/i.test(query)) {
    hints.add('teams')
  }
  if (
    /\bfrontend\b|\bbackend\b|\binfra\b|\bdesign\b|\breview\b|\blanding page\b|\bdeploy\b|\bci\b/i.test(
      query,
    )
  ) {
    hints.add('teams')
  }
  if (
    /\bremember\b|\bmemory\b|\bmemories\b|\bprevious\b|\bcontext\b|\bresume\b/i.test(
      query,
    )
  ) {
    hints.add('memories')
  }
  if (lower.includes('session memory')) {
    hints.add('memories')
  }

  return hints
}

function shouldIncludePromptSection(
  section: 'skills' | 'agents' | 'teams' | 'memories',
  onlyWhenRelevant: boolean | undefined,
  hints: Set<string>,
): boolean {
  if (!onlyWhenRelevant) {
    return true
  }

  return hints.has(section)
}

function getClaudeMdBlocks(cwd: string, config: ContextConfig): string[] {
  const contextRevision = syncContextCacheRevision()
  const cacheKey = [
    contextRevision,
    cwd,
    config.maxClaudeMdFiles ?? DEFAULT_CONTEXT_CONFIG.maxClaudeMdFiles,
    config.maxClaudeMdContentLength ??
      DEFAULT_CONTEXT_CONFIG.maxClaudeMdContentLength,
  ].join('|')

  if (cachedClaudeMdKey === cacheKey && cachedClaudeMdBlocks.length > 0) {
    return cachedClaudeMdBlocks
  }

  const claudeMdFiles = loadClaudeMdFiles(cwd)
  const blocks = claudeMdFiles
    .slice(0, config.maxClaudeMdFiles)
    .map(
      file =>
        `Contents of ${file.path}:\n${file.content.slice(
          0,
          config.maxClaudeMdContentLength,
        )}`,
    )

  cachedClaudeMdKey = cacheKey
  cachedClaudeMdBlocks = blocks
  return blocks
}

function getSkillsPrompt(
  cwd: string,
  skills: Skill[],
  config: ContextConfig,
): string {
  const contextRevision = syncContextCacheRevision()
  const cacheKey = [
    contextRevision,
    cwd,
    skills.length,
    config.maxSkillsInPrompt ?? DEFAULT_CONTEXT_CONFIG.maxSkillsInPrompt,
  ].join('|')

  if (cachedSkillsKey === cacheKey && cachedSkillsText) {
    return cachedSkillsText
  }

  const limitedSkills = skills.slice(0, config.maxSkillsInPrompt)
  const prompt = formatSkillsForPrompt(limitedSkills)
  cachedSkillsKey = cacheKey
  cachedSkillsText = prompt
  return prompt
}

function selectContextBlocksForBudget(
  blocks: ContextBlock[],
  maxContextTokens: number,
): ContextBlock[] {
  const required = blocks.filter(block => !block.optional)
  const optional = blocks
    .filter(block => block.optional)
    .sort((left, right) => right.priority - left.priority)

  const selected: ContextBlock[] = []
  let usedTokens = 0

  for (const block of required) {
    selected.push(block)
    usedTokens += estimatePromptTokens(block.text)
  }

  for (const block of optional) {
    let text = block.text
    let blockTokens = estimatePromptTokens(text)
    if (usedTokens + blockTokens > maxContextTokens && block.renderToFit) {
      const remainingTokens = Math.max(0, maxContextTokens - usedTokens)
      const minTokens = Math.max(1, block.minTokens ?? 1)
      if (remainingTokens < minTokens) {
        continue
      }
      const rendered = block.renderToFit(remainingTokens)
      if (!rendered) {
        continue
      }
      text = rendered
      blockTokens = estimatePromptTokens(text)
    }

    if (usedTokens + blockTokens > maxContextTokens) {
      continue
    }

    selected.push(text === block.text ? block : { ...block, text })
    usedTokens += blockTokens
  }

  return selected
}

function buildBudgetedMemoryLikeBlock(input: {
  key: keyof ContextParts
  priority: number
  maxChars: number | undefined
  minTokens: number
  render: (maxChars: number) => string | undefined
}): ContextBlock | undefined {
  const defaultMaxChars = normalizeMaxChars(input.maxChars, 900)
  const initialText = input.render(defaultMaxChars)
  if (!initialText) {
    return undefined
  }

  return {
    key: input.key,
    text: initialText,
    priority: input.priority,
    optional: true,
    minTokens: input.minTokens,
    renderToFit: remainingTokens => {
      const maxChars = tokensToChars(remainingTokens)
      if (maxChars <= 0) {
        return undefined
      }
      return input.render(Math.min(defaultMaxChars, maxChars))
    },
  }
}

function buildBudgetedSessionMemoryBlock(
  config: ContextConfig,
  minTokens: number,
): ContextBlock | undefined {
  const initialText = getSessionMemoryContext(config)
  if (!initialText) {
    return undefined
  }

  const defaultMaxChars = normalizeMaxChars(
    config.sessionMemoryPromptMaxChars,
    900,
  )

  return {
    key: 'sessionMemory',
    text: initialText,
    priority: 65,
    optional: true,
    minTokens,
    renderToFit: remainingTokens => {
      const maxChars = tokensToChars(remainingTokens)
      if (maxChars <= 0) {
        return undefined
      }
      return (
        getSessionMemoryContext(config, Math.min(defaultMaxChars, maxChars)) ||
        undefined
      )
    },
  }
}

function materializeContextPartsFromBlocks(
  blocks: ContextBlock[],
): ContextParts {
  const parts: ContextParts = {}

  for (const block of blocks) {
    if (block.key === 'claudeMd') {
      if (!parts.claudeMd) {
        parts.claudeMd = []
      }
      parts.claudeMd.push(block.text)
      continue
    }

    parts[block.key] = block.text
  }

  return parts
}

function normalizeMaxChars(
  value: number | undefined,
  fallback: number,
): number {
  return Math.max(0, value ?? fallback)
}

function tokensToChars(tokens: number): number {
  return Math.max(0, tokens) * 4
}

function syncContextCacheRevision(): number {
  const revision = getSystemContextCacheRevision()
  if (revision === localContextCacheRevision) {
    return revision
  }

  cachedEnhancedContexts.clear()
  cachedClaudeMdKey = ''
  cachedClaudeMdBlocks = []
  cachedSkillsKey = ''
  cachedSkillsText = ''
  localContextCacheRevision = revision
  return revision
}

function buildConversationSignature(
  messages: BetaMessageParam[] | undefined,
): string {
  if (!messages || messages.length === 0) {
    return ''
  }

  const tail = messages.slice(-3).map(message => ({
    role: message.role,
    text: getMessagePromptText(message).slice(0, 160),
  }))

  return JSON.stringify({
    count: messages.length,
    query: extractConversationQuery(messages),
    tail,
    hasSessionMemorySummary: hasSessionMemoryCompactionSummary(messages),
  })
}

function buildEnhancedContextCacheKey(input: {
  cwd: string
  skillContextOverride?: string
  config: ContextConfig
  conversationSignature: string
  revision: number
  sessionId: string | null
}): string {
  return JSON.stringify({
    revision: input.revision,
    cwd: input.cwd,
    sessionId: input.sessionId,
    skillContextOverride: input.skillContextOverride ?? null,
    conversationSignature: input.conversationSignature,
    config: serializeContextConfig(input.config),
  })
}

function serializeContextConfig(
  config: ContextConfig,
): Record<string, unknown> {
  return {
    includeDate: config.includeDate,
    includeWorkingDirectory: config.includeWorkingDirectory,
    includeGit: config.includeGit,
    includeClaudeMd: config.includeClaudeMd,
    includeSkills: config.includeSkills,
    includeMemories: config.includeMemories,
    includeAgents: config.includeAgents,
    includeTeams: config.includeTeams,
    includeEnvironment: config.includeEnvironment,
    includeTeamMemory: config.includeTeamMemory,
    sessionMemoryMode: config.sessionMemoryMode,
    sessionMemoryPromptMaxChars: config.sessionMemoryPromptMaxChars,
    sessionMemoryPromptMaxNotesPerCategory:
      config.sessionMemoryPromptMaxNotesPerCategory,
    maxContextTokens: config.maxContextTokens,
    maxMemoriesInPrompt: config.maxMemoriesInPrompt,
    maxMemoryPromptChars: config.maxMemoryPromptChars,
    maxTeamMemoryPromptChars: config.maxTeamMemoryPromptChars,
    maxSkillsInPrompt: config.maxSkillsInPrompt,
    maxAgentsInPrompt: config.maxAgentsInPrompt,
    maxTeamsInPrompt: config.maxTeamsInPrompt,
    includeSkillsOnlyWhenRelevant: config.includeSkillsOnlyWhenRelevant,
    includeAgentsOnlyWhenRelevant: config.includeAgentsOnlyWhenRelevant,
    includeTeamsOnlyWhenRelevant: config.includeTeamsOnlyWhenRelevant,
    includeMemoriesOnlyWhenRelevant: config.includeMemoriesOnlyWhenRelevant,
    maxClaudeMdFiles: config.maxClaudeMdFiles,
    maxClaudeMdContentLength: config.maxClaudeMdContentLength,
  }
}

function getCachedEnhancedContext(
  cacheKey: string,
): EnhancedContext | undefined {
  const now = Date.now()
  const cached = cachedEnhancedContexts.get(cacheKey)
  if (!cached) {
    return undefined
  }

  if (cached.expiresAt <= now) {
    cachedEnhancedContexts.delete(cacheKey)
    return undefined
  }

  return cloneEnhancedContext(cached.value)
}

function setCachedEnhancedContext(
  cacheKey: string,
  value: EnhancedContext,
): void {
  purgeExpiredEnhancedContextEntries()
  cachedEnhancedContexts.set(cacheKey, {
    expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
    value: cloneEnhancedContext(value),
  })

  while (cachedEnhancedContexts.size > MAX_ENHANCED_CONTEXT_CACHE_ENTRIES) {
    const oldestKey = cachedEnhancedContexts.keys().next().value
    if (typeof oldestKey !== 'string') {
      break
    }
    cachedEnhancedContexts.delete(oldestKey)
  }
}

function purgeExpiredEnhancedContextEntries(): void {
  const now = Date.now()
  for (const [cacheKey, entry] of cachedEnhancedContexts.entries()) {
    if (entry.expiresAt <= now) {
      cachedEnhancedContexts.delete(cacheKey)
    }
  }
}

function cloneEnhancedContext(value: EnhancedContext): EnhancedContext {
  return {
    fullContext: value.fullContext,
    parts: {
      ...value.parts,
      claudeMd: value.parts.claudeMd ? [...value.parts.claudeMd] : undefined,
    },
    gitStatus: value.gitStatus ? { ...value.gitStatus } : undefined,
    timestamp: new Date(value.timestamp.getTime()),
  }
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
