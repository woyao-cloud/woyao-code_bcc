import { loadClaudeMdFiles } from './utils/claudemd.js'
import { getIsGit, getBranch, gitExe } from './utils/git.js'
import { getCwd } from './bootstrap/state.js'
import {
  discoverSkills,
  formatSkillsForPrompt,
} from './services/skill/skillLoader.js'
import { formatMemoriesForPrompt } from './services/memory/memoryStore.js'

export async function getSystemContext(
  skillContextOverride?: string,
): Promise<string> {
  const cwd = getCwd()
  const parts: string[] = []

  // Date/time
  parts.push(`Current date: ${new Date().toISOString().split('T')[0]}`)

  // Working directory
  parts.push(`Working directory: ${cwd}`)

  // Git context
  const hasGit = await getIsGit(cwd)
  if (hasGit) {
    const branch = await getBranch(cwd)
    if (branch) parts.push(`Current git branch: ${branch}`)
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

  return parts.join('\n\n')
}

export async function getUserContext(): Promise<string> {
  return ''
}
