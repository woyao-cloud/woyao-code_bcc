// ============================================================
// Enhanced Skill Loader for mini-v6
// ============================================================

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface Skill {
  name: string
  path: string
  content: string
  source: 'project' | 'user' | 'plugin' | 'store'
}

/**
 * Discover skills from multiple sources:
 * 1. .agents/skills/ and .codex/skills/ in project
 * 2. ~/.claude-code-mini/skills/
 * 3. Plugin-contributed skills (passed in)
 */
export function discoverSkills(
  projectRoot: string,
  pluginSkills?: Array<{ name: string; path: string; content: string }>,
): Skill[] {
  const skills: Skill[] = []

  // Project-level skills
  const projectSkillDirs = [
    join(projectRoot, '.agents', 'skills'),
    join(projectRoot, '.codex', 'skills'),
  ]
  for (const dir of projectSkillDirs) {
    loadSkillsFromDir(dir, 'project', skills)
  }

  // User-level skills
  const userSkillDir = join(homedir(), '.claude-code-mini', 'skills')
  loadSkillsFromDir(userSkillDir, 'user', skills)

  // Plugin skills
  if (pluginSkills) {
    for (const ps of pluginSkills) {
      // Avoid duplicates with project/user skills
      if (!skills.some(s => s.name === ps.name && s.source === 'plugin')) {
        skills.push({
          name: ps.name,
          path: ps.path,
          content: ps.content.slice(0, 5000),
          source: 'plugin',
        })
      }
    }
  }

  return skills
}

function loadSkillsFromDir(
  dir: string,
  source: 'project' | 'user',
  skills: Skill[],
): void {
  if (!existsSync(dir)) return
  try {
    const items = readdirSync(dir)
    for (const item of items) {
      const skillDir = join(dir, item)
      try {
        if (!statSync(skillDir).isDirectory()) continue
        const skillMd = join(skillDir, 'SKILL.md')
        if (existsSync(skillMd)) {
          const content = readFileSync(skillMd, 'utf-8')
          skills.push({
            name: item,
            path: skillMd,
            content: content.slice(0, 5000),
            source,
          })
        }
      } catch {}
    }
  } catch {}
}

/**
 * Format skills for inclusion in the system prompt.
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return ''

  const lines = ['', '## Available Skills', '']
  for (const s of skills) {
    const preview = s.content.slice(0, 200).split('\n')[0] ?? ''
    lines.push(`- ${s.name} [${s.source}]: ${preview}`)
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Find a skill by name.
 */
export function findSkillByName(
  skills: Skill[],
  name: string,
): Skill | undefined {
  return skills.find(s => s.name === name)
}
