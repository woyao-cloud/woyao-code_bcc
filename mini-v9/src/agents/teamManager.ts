// ============================================================
// Team Manager for mini-v8
// ============================================================
// Team lifecycle management:
// - TeamCreate: Form a new team with a lead and optional members
// - TeamDelete: Disband a team and clean up resources
// - Member management: Add/remove members, update status
// - Message routing: Send messages between team members
// ============================================================

import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { TeamDefinition, TeamMember, AgentRole } from './agentTypes.js'
import { logDebug } from '../utils/log.js'
import { getCwd } from '../bootstrap/state.js'
import { invalidateSystemContextCache } from '../services/context/contextCacheState.js'
import {
  initializeTeamMailboxes,
  cleanupTeamMailboxes,
  removeInboxFile,
  writeToMailbox,
  setMailboxBaseDir,
} from './teammateMailbox.js'

// ---------- Team State ----------

/** Active teams keyed by team name */
const activeTeams = new Map<string, TeamDefinition>()

/** Configurable base directory for team files (overridable for tests) */
let teamsBaseDir: string | null = null

/**
 * Set the base directory for team files.
 * Used by tests to avoid writing to the real home directory.
 */
export function setTeamsBaseDir(path: string | null): void {
  teamsBaseDir = path
  setMailboxBaseDir(path ? join(path, 'teams') : null)
  invalidateSystemContextCache()
}

/** Team files directory */
function getTeamsDir(): string {
  if (teamsBaseDir) return join(teamsBaseDir, 'teams')
  return join(homedir(), '.claude', 'teams')
}

// ---------- Team File Persistence ----------

/**
 * Get the file path for a team definition.
 */
function getTeamFilePath(teamName: string): string {
  const safeName = teamName.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(getTeamsDir(), `${safeName}.json`)
}

/**
 * Write team definition to disk.
 */
function writeTeamFile(team: TeamDefinition): void {
  const dir = getTeamsDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const filePath = getTeamFilePath(team.name)
  writeFileSync(filePath, JSON.stringify(team, null, 2), 'utf-8')
}

/**
 * Read team definition from disk.
 */
function readTeamFile(teamName: string): TeamDefinition | null {
  const filePath = getTeamFilePath(teamName)
  if (!existsSync(filePath)) return null
  try {
    const data = readFileSync(filePath, 'utf-8')
    return JSON.parse(data) as TeamDefinition
  } catch {
    return null
  }
}

/**
 * Delete team file from disk.
 */
function deleteTeamFile(teamName: string): void {
  const filePath = getTeamFilePath(teamName)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}

// ---------- Team Operations ----------

/**
 * Create a new team.
 * Returns the created team definition.
 */
export function createTeam(
  name: string,
  description?: string,
  leadAgentType?: string,
): { team: TeamDefinition; leadMemberId: string } {
  // Generate unique name if conflict
  const existing = activeTeams.get(name) ?? readTeamFile(name)
  const finalName = existing ? `${name}-${Date.now()}` : name

  const leadId = randomUUID()
  const cwd = getCwd()
  const sessionId = randomUUID()

  const leadMember: TeamMember = {
    agentId: leadId,
    name: 'team-lead',
    agentType: leadAgentType ?? 'general-purpose',
    role: 'lead',
    model: 'inherit',
    joinedAt: Date.now(),
    cwd,
    isActive: true,
  }

  const team: TeamDefinition = {
    name: finalName,
    description: description ?? `Team created for collaborative work`,
    createdAt: Date.now(),
    leadAgentId: leadId,
    leadSessionId: sessionId,
    members: [leadMember],
  }

  // Persist
  activeTeams.set(finalName, team)
  writeTeamFile(team)
  invalidateSystemContextCache()

  // Initialize mailboxes for team communication
  initializeTeamMailboxes(finalName, ['team-lead'])
  writeToMailbox(
    'team-lead',
    {
      from: 'system',
      text: JSON.stringify({ type: 'team_created', team: finalName }),
      timestamp: new Date().toISOString(),
      summary: `Team "${finalName}" created`,
    },
    finalName,
  )

  logDebug(`Team "${finalName}" created with lead agent ${leadId}`)

  return { team, leadMemberId: leadId }
}

/**
 * Delete/disband a team.
 */
export function deleteTeam(teamName: string): {
  success: boolean
  message: string
} {
  const team = activeTeams.get(teamName) ?? readTeamFile(teamName)

  if (!team) {
    return {
      success: false,
      message: `Team "${teamName}" not found.`,
    }
  }

  // Check for active members (besides lead)
  const activeMembers = team.members.filter(
    m => m.role !== 'lead' && m.isActive,
  )

  if (activeMembers.length > 0) {
    const names = activeMembers.map(m => m.name).join(', ')
    return {
      success: false,
      message: `Cannot delete team with ${activeMembers.length} active member(s): ${names}. Stop agents first.`,
    }
  }

  // Cleanup
  activeTeams.delete(teamName)
  deleteTeamFile(teamName)
  cleanupTeamMailboxes(teamName)
  invalidateSystemContextCache()

  logDebug(`Team "${teamName}" deleted`)

  return {
    success: true,
    message: `Team "${teamName}" disbanded.`,
  }
}

/**
 * Add a member to a team.
 */
export function addTeamMember(
  teamName: string,
  memberName: string,
  agentType: string,
  role: AgentRole = 'worker',
): TeamMember | null {
  const team = activeTeams.get(teamName) ?? readTeamFile(teamName)

  if (!team) return null

  const memberId = randomUUID()
  const member: TeamMember = {
    agentId: memberId,
    name: memberName,
    agentType,
    role,
    joinedAt: Date.now(),
    cwd: getCwd(),
    isActive: true,
  }

  team.members.push(member)
  activeTeams.set(teamName, team)
  writeTeamFile(team)
  initializeTeamMailboxes(teamName, [memberName])
  invalidateSystemContextCache()

  logDebug(`Member "${memberName}" added to team "${teamName}"`)

  return member
}

/**
 * Remove a member from a team.
 */
export function removeTeamMember(teamName: string, memberId: string): boolean {
  const team = activeTeams.get(teamName) ?? readTeamFile(teamName)

  if (!team) return false

  const index = team.members.findIndex(m => m.agentId === memberId)
  if (index === -1) return false

  const removed = team.members.splice(index, 1)[0]
  team.members.splice(index, 1)
  activeTeams.set(teamName, team)
  writeTeamFile(team)
  removeInboxFile(removed.name, teamName)
  invalidateSystemContextCache()

  return true
}

/**
 * Update a member's active status.
 */
export function updateMemberStatus(
  teamName: string,
  memberId: string,
  isActive: boolean,
): boolean {
  const team = activeTeams.get(teamName) ?? readTeamFile(teamName)

  if (!team) return false

  const member = team.members.find(m => m.agentId === memberId)
  if (!member) return false

  member.isActive = isActive
  activeTeams.set(teamName, team)
  writeTeamFile(team)
  invalidateSystemContextCache()

  return true
}

/**
 * Get a team by name.
 */
export function getTeam(teamName: string): TeamDefinition | undefined {
  return activeTeams.get(teamName) ?? readTeamFile(teamName) ?? undefined
}

/**
 * Get all active teams.
 */
export function getAllTeams(): TeamDefinition[] {
  return Array.from(activeTeams.values())
}

/**
 * Get members of a team.
 */
export function getTeamMembers(teamName: string): TeamMember[] {
  const team = getTeam(teamName)
  return team?.members ?? []
}

/**
 * Check if a team exists.
 */
export function teamExists(teamName: string): boolean {
  return activeTeams.has(teamName) || existsSync(getTeamFilePath(teamName))
}

// ---------- Team Context for System Prompt ----------

/**
 * Format active teams for inclusion in the system prompt.
 */
export function getTeamsForPrompt(): string {
  return getTeamsForPromptWithOptions()
}

export function getTeamsForPromptWithOptions(options?: {
  query?: string
  limit?: number
}): string {
  const teams = selectTeamsForPrompt(options)
  if (teams.length === 0) return ''

  const lines = ['Active teams:', '']
  for (const team of teams) {
    const memberSummary = team.members
      .map(m => `  - ${m.name} (${m.agentType}, ${m.role})`)
      .join('\n')
    lines.push(
      `Team "${team.name}": ${team.members.length} members${team.description ? ` - ${team.description}` : ''}\n${memberSummary}`,
    )
  }
  return lines.join('\n')
}

function selectTeamsForPrompt(options?: {
  query?: string
  limit?: number
}): TeamDefinition[] {
  const teams = getAllTeams()
  if (teams.length === 0) return []

  const limit = Math.max(1, options?.limit ?? 4)
  const query = options?.query?.trim().toLowerCase() ?? ''
  if (!query) {
    return teams.slice(0, limit)
  }

  const ranked = rankTeamsForPrompt(teams, query)
    .filter(entry => entry.score > 0)
    .slice(0, limit)
    .map(entry => entry.team)

  if (ranked.length > 0) {
    return ranked
  }

  return []
}

function rankTeamsForPrompt(
  teams: TeamDefinition[],
  query: string,
): Array<{ team: TeamDefinition; score: number }> {
  const queryTerms = query
    .split(/[^a-z0-9_-]+/i)
    .map(term => term.trim())
    .filter(Boolean)
    .filter(term => !TEAM_QUERY_STOPWORDS.has(term))

  return teams
    .map(team => ({
      team,
      score: scoreTeamForPrompt(team, queryTerms),
    }))
    .sort((left, right) => right.score - left.score)
}

function scoreTeamForPrompt(
  team: TeamDefinition,
  queryTerms: string[],
): number {
  const haystack = [
    team.name,
    team.description ?? '',
    team.members
      .map(member => `${member.name} ${member.agentType} ${member.role}`)
      .join(' '),
  ]
    .join(' ')
    .toLowerCase()

  let score = 0
  for (const term of queryTerms) {
    if (!term) continue
    if (team.name.toLowerCase().includes(term)) {
      score += 5
    }
    if ((team.description ?? '').toLowerCase().includes(term)) {
      score += 3
    }
    if (team.members.some(member => member.name.toLowerCase().includes(term))) {
      score += 2
    }
    if (
      team.members.some(member => member.agentType.toLowerCase().includes(term))
    ) {
      score += 2
    }
    if (haystack.includes(term)) {
      score += 1
    }
  }

  return score
}

const TEAM_QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'for',
  'and',
  'or',
  'of',
  'in',
  'on',
  'with',
  'ask',
  'show',
  'continue',
  'team',
  'teams',
  'member',
  'members',
])

/**
 * Reset all team state (for testing).
 */
export function resetTeamManager(): void {
  activeTeams.clear()
  invalidateSystemContextCache()
}
