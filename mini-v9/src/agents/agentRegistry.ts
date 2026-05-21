// ============================================================
// Agent Registry for mini-v8
// ============================================================
// Discovers and loads agent definitions from:
// 1. Built-in agents
// 2. User-defined agents (~/.claude/agents/)
// 3. Project-defined agents (.claude/agents/)
// 4. Plugin-defined agents
// ============================================================

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { AgentDefinition, AgentSource } from './agentTypes.js'
import { getBuiltInAgents } from './builtInAgents.js'
import type { LoadedPlugin } from '../plugins/types.js'
import { invalidateSystemContextCache } from '../services/context/contextCacheState.js'

// ---------- Registry State ----------

/** All registered agent definitions, keyed by agentType */
const agentRegistry = new Map<string, AgentDefinition>()

/** Whether the registry has been initialized */
let initialized = false

// ---------- Discovery & Loading ----------

/**
 * Initialize the agent registry.
 * Discovers agents from all sources and populates the registry.
 */
export function initAgentRegistry(
  cwd: string,
  plugins: LoadedPlugin[] = [],
): void {
  if (initialized) return

  // 1. Load built-in agents
  const builtIn = getBuiltInAgents()
  for (const agent of builtIn) {
    registerAgent(agent)
  }

  // 2. Load user-defined agents from ~/.claude/agents/
  const userAgentsDir = join(homedir(), '.claude', 'agents')
  loadAgentsFromDir(userAgentsDir, 'user')

  // 3. Load project-defined agents from .claude/agents/
  const projectAgentsDir = join(cwd, '.claude', 'agents')
  loadAgentsFromDir(projectAgentsDir, 'project')

  // 4. Load plugin-defined agents
  for (const plugin of plugins) {
    if (plugin.enabled && plugin.installPath) {
      loadPluginAgents(plugin)
    }
  }

  initialized = true
}

/**
 * Register a single agent definition.
 * If an agent with the same agentType already exists from a higher-priority
 * source, the new definition is skipped.
 */
export function registerAgent(agent: AgentDefinition): void {
  const existing = agentRegistry.get(agent.agentType)
  if (existing) {
    // Built-in < user < project < plugin in priority
    const priority: Record<AgentSource, number> = {
      'built-in': 0,
      user: 1,
      project: 2,
      plugin: 3,
      local: 4,
    }
    const existingPriority = priority[existing.source] ?? 0
    const newPriority = priority[agent.source] ?? 0
    if (newPriority <= existingPriority) return
  }
  agentRegistry.set(agent.agentType, agent)
  invalidateSystemContextCache()
}

/**
 * Unregister an agent by agentType.
 */
export function unregisterAgent(agentType: string): boolean {
  const deleted = agentRegistry.delete(agentType)
  if (deleted) {
    invalidateSystemContextCache()
  }
  return deleted
}

// ---------- Lookup ----------

/**
 * Get an agent definition by agentType.
 */
export function getAgent(agentType: string): AgentDefinition | undefined {
  return agentRegistry.get(agentType)
}

/**
 * Get all registered agent definitions.
 */
export function getAllAgents(): AgentDefinition[] {
  return Array.from(agentRegistry.values())
}

/**
 * Search agents by name or description.
 */
export function searchAgents(query: string): AgentDefinition[] {
  const lower = query.toLowerCase()
  return getAllAgents().filter(
    a =>
      a.agentType.toLowerCase().includes(lower) ||
      a.whenToUse.toLowerCase().includes(lower) ||
      (a.description && a.description.toLowerCase().includes(lower)),
  )
}

/**
 * Get agents formatted for inclusion in the system prompt.
 */
export function getAgentsForPrompt(): string {
  return getAgentsForPromptWithOptions()
}

export function getAgentsForPromptWithOptions(options?: {
  limit?: number
  query?: string
}): string {
  const agents = getAllAgents()
  if (agents.length === 0) return ''

  const limit = Math.max(1, options?.limit ?? 8)
  const query = options?.query?.trim().toLowerCase() ?? ''
  const selectedAgents = query
    ? rankAgentsForPrompt(agents, query).slice(0, limit)
    : agents.slice(0, limit)

  const lines = ['Available agents:', '']
  for (const agent of selectedAgents) {
    lines.push(`- ${agent.agentType}: ${agent.whenToUse.slice(0, 200)}`)
  }
  return lines.join('\n')
}

function rankAgentsForPrompt(
  agents: AgentDefinition[],
  query: string,
): AgentDefinition[] {
  const queryTerms = query
    .split(/[^a-z0-9_-]+/i)
    .map(term => term.trim())
    .filter(Boolean)

  return [...agents].sort((left, right) => {
    const rightScore = scoreAgentForPrompt(right, queryTerms)
    const leftScore = scoreAgentForPrompt(left, queryTerms)
    return rightScore - leftScore
  })
}

function scoreAgentForPrompt(
  agent: AgentDefinition,
  queryTerms: string[],
): number {
  const haystack = [agent.agentType, agent.whenToUse, agent.description ?? '']
    .join(' ')
    .toLowerCase()

  let score = 0
  for (const term of queryTerms) {
    if (!term) continue
    if (agent.agentType.toLowerCase().includes(term)) {
      score += 4
    }
    if (agent.whenToUse.toLowerCase().includes(term)) {
      score += 2
    }
    if (haystack.includes(term)) {
      score += 1
    }
  }

  return score
}

/**
 * Get all agent type names.
 */
export function getAgentTypeNames(): string[] {
  return Array.from(agentRegistry.keys())
}

// ---------- File-based Agent Loading ----------

/**
 * Load agents from a directory containing .md files with frontmatter.
 */
function loadAgentsFromDir(dir: string, source: AgentSource): void {
  if (!existsSync(dir)) return

  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      const filePath = join(dir, entry)
      const agent = parseAgentMarkdownFile(filePath, source)
      if (agent) {
        registerAgent(agent)
      }
    }
  } catch {
    // Directory access error - skip
  }
}

/**
 * Parse a Claude Code agent markdown file.
 * Supports frontmatter with YAML-like key-value pairs.
 */
function parseAgentMarkdownFile(
  filePath: string,
  source: AgentSource,
): AgentDefinition | null {
  try {
    const raw = readFileSync(filePath, 'utf-8')

    // Parse frontmatter
    let agentType = basename(filePath, '.md')
    let whenToUse = ''
    let description: string | undefined
    let tools: string[] | undefined
    let disallowedTools: string[] | undefined
    let skills: string[] | undefined
    let model: string | undefined
    let maxTurns: number | undefined
    let permissionMode: string | undefined
    let color: string | undefined
    let background: boolean | undefined
    let initialPrompt: string | undefined

    // Extract body (system prompt) - everything after frontmatter ---
    let body = raw

    // Handle YAML-like frontmatter: lines between --- markers
    const lines = raw.split('\n')
    if (lines[0]?.trim() === '---') {
      let endIdx = -1
      for (let i = 1; i < lines.length; i++) {
        if (lines[i]?.trim() === '---') {
          endIdx = i
          break
        }
        const line = lines[i] ?? ''
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim()
          const value = line.slice(colonIdx + 1).trim()
          switch (key) {
            case 'agentType':
              agentType = value
              break
            case 'whenToUse':
              whenToUse = value
              break
            case 'description':
              description = value
              break
            case 'tools':
              tools = value
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
              break
            case 'disallowedTools':
              disallowedTools = value
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
              break
            case 'skills':
              skills = value
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
              break
            case 'model':
              model = value
              break
            case 'maxTurns': {
              const n = parseInt(value, 10)
              if (!isNaN(n)) maxTurns = n
              break
            }
            case 'permissionMode':
              permissionMode = value
              break
            case 'color':
              color = value
              break
            case 'background':
              background = value.toLowerCase() === 'true'
              break
            case 'initialPrompt':
              initialPrompt = value
              break
          }
        }
      }
      if (endIdx > 0 && endIdx + 1 < lines.length) {
        body = lines.slice(endIdx + 1).join('\n')
      }
    }

    const systemPromptText = body.trim()
    const filename = basename(filePath, '.md')

    const agentDef: AgentDefinition = {
      agentType,
      whenToUse: whenToUse || `${filename} agent`,
      description,
      tools,
      disallowedTools,
      skills,
      model,
      maxTurns,
      permissionMode,
      color,
      background,
      initialPrompt,
      source,
      baseDir: source,
      filename,
      getSystemPrompt: () => systemPromptText,
    }

    return agentDef
  } catch {
    return null
  }
}

/**
 * Load agents from a plugin.
 * Looks for agents/ subdirectory in the plugin's directory.
 */
function loadPluginAgents(plugin: LoadedPlugin): void {
  if (!plugin.installPath) return
  const agentsDir = join(plugin.installPath, 'agents')
  loadAgentsFromDir(agentsDir, 'plugin')
}

/**
 * Reset the registry (for testing).
 */
export function resetAgentRegistry(): void {
  agentRegistry.clear()
  initialized = false
}
