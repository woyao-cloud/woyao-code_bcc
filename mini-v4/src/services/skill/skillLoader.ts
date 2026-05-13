/**
 * Simple Skill system for mini-v3.
 * Loads SKILL.md files from project directories.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'

export interface Skill {
  name: string
  path: string
  content: string
}

/**
 * Discover and load skills from .agents/skills/ and .codex/skills/ directories.
 */
export function discoverSkills(projectRoot: string): Skill[] {
  const skills: Skill[] = []
  const searchDirs = [
    join(projectRoot, '.agents', 'skills'),
    join(projectRoot, '.codex', 'skills'),
  ]

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue
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
            })
          }
        } catch {}
      }
    } catch {}
  }

  return skills
}

/**
 * Format skills for inclusion in system prompt
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return ''

  const lines = ['', '## Available Skills', '']
  for (const s of skills) {
    lines.push(`- ${s.name}: ${s.content.slice(0, 200).split('\n')[0]}`)
  }
  lines.push('')
  return lines.join('\n')
}
