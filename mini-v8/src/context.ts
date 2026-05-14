import { loadClaudeMdFiles } from './utils/claudemd.js'
import { getGitStatus } from './utils/git.js'
import { getCwd } from './bootstrap/state.js'
import {
  discoverSkills,
  formatSkillsForPrompt,
} from './services/skill/skillLoader.js'
import { formatMemoriesForPrompt } from './services/memory/memoryStore.js'
import { getAgentsForPrompt } from './agents/agentRegistry.js'
import { getTeamsForPrompt } from './agents/teamManager.js'

export async function getSystemContext(
  skillContextOverride?: string,
): Promise<string> {
  const cwd = getCwd()
  const parts: string[] = []

  // Date/time
  parts.push(`Current date: ${new Date().toISOString().split('T')[0]}`)

  // Working directory
  parts.push(`Working directory: ${cwd}`)

  // Git context - enhanced with comprehensive status
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

  // CLAUDE.md / AGENTS.md files
  const claudeMdFiles = loadClaudeMdFiles(cwd)
  if (claudeMdFiles.length > 0) {
    for (const file of claudeMdFiles.slice(0, 3)) {
      parts.push(`Contents of ${file.path}:\n${file.content.slice(0, 2000)}`)
    }
  }

  // Skills (use override if provided, else compute)
  if (skillContextOverride !== undefined) {
    if (skillContextOverride) parts.push(skillContextOverride)
  } else {
    const skillsText = formatSkillsForPrompt(discoverSkills(cwd))
    if (skillsText) parts.push(skillsText)
  }

  // Memories
  const memoriesText = formatMemoriesForPrompt()
  if (memoriesText) parts.push(memoriesText)

  // Agents
  const agentsText = getAgentsForPrompt()
  if (agentsText) parts.push(agentsText)

  // Active teams
  const teamsText = getTeamsForPrompt()
  if (teamsText) parts.push(teamsText)

  return parts.join('\n\n')
}

export async function getUserContext(): Promise<string> {
  return ''
}

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
