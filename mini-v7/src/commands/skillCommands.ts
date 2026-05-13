// ============================================================
// Skill REPL Commands for mini-v6
// ============================================================

import type { Skill } from '../services/skill/skillLoader.js'

/**
 * Handle /skill-store commands in the REPL.
 */
export async function handleSkillStoreCommand(args: string): Promise<string> {
  const trimmed = args.trim()

  if (!trimmed || trimmed === 'help') {
    return skillStoreHelp()
  }

  // List skills from store
  if (trimmed === 'list') {
    return skillStoreList()
  }

  // Search skills
  if (trimmed.startsWith('search ')) {
    const query = trimmed.slice('search '.length).trim()
    return skillStoreSearch(query)
  }

  // Install a skill from store
  if (trimmed.startsWith('install ')) {
    const spec = trimmed.slice('install '.length).trim()
    return skillStoreInstall(spec)
  }

  // Uninstall a locally installed skill
  if (trimmed.startsWith('uninstall ')) {
    const name = trimmed.slice('uninstall '.length).trim()
    return skillStoreUninstall(name)
  }

  // List locally installed skills
  if (trimmed === 'installed') {
    return skillStoreInstalledList()
  }

  return `Unknown skill-store command: ${trimmed}\
Use /skill-store help for usage.`
}

function skillStoreHelp(): string {
  return [
    'Skill Store commands:',
    '  /skill-store list         - List skills from cloud store',
    '  /skill-store search <q>    - Search skills by name/description',
    '  /skill-store install <id>  - Install a skill from the store',
    '  /skill-store uninstall <name> - Uninstall a local skill',
    '  /skill-store installed     - List locally installed skills',
    '  /skill-store help          - Show this help',
  ].join('\n')
}

async function skillStoreList(): Promise<string> {
  try {
    const { listStoreSkills, saveCachedSkillList } = await import(
      '../services/skill/skillStore.js'
    )
    const skills = await listStoreSkills()
    saveCachedSkillList(skills)

    if (skills.length === 0) {
      return 'No skills available in the store.'
    }

    const lines = [`${skills.length} skill(s) in store:`, '']
    for (const s of skills.slice(0, 20)) {
      lines.push(`  ${s.skill_id} - ${s.name} (by ${s.owner})`)
      if (s.description) lines.push(`    ${s.description}`)
    }
    if (skills.length > 20) {
      lines.push(
        `  ... and ${skills.length - 20} more. Use /skill-store search to filter.`,
      )
    }
    return lines.join('\n')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)

    // Fall back to cache
    const { loadCachedSkillList } = await import(
      '../services/skill/skillStore.js'
    )
    const cached = loadCachedSkillList()
    if (cached.length > 0) {
      return [
        `Skill store unavailable (${msg}). Showing cached results:`,
        '',
        ...cached.slice(0, 10).map(s => `  ${s.skill_id} - ${s.name}`),
      ].join('\n')
    }

    return `Failed to list skills: ${msg}\
Note: Skill store requires ANTHROPIC_API_KEY and network access.`
  }
}

async function skillStoreSearch(query: string): Promise<string> {
  try {
    const { loadCachedSkillList, saveCachedSkillList } = await import(
      '../services/skill/skillStore.js'
    )

    // Try live fetch first
    let skills = loadCachedSkillList()
    try {
      const { listStoreSkills } = await import(
        '../services/skill/skillStore.js'
      )
      skills = await listStoreSkills()
      saveCachedSkillList(skills)
    } catch {}

    const lower = query.toLowerCase()
    const results = skills.filter(
      s =>
        s.skill_id.toLowerCase().includes(lower) ||
        s.name.toLowerCase().includes(lower) ||
        (s.description && s.description.toLowerCase().includes(lower)) ||
        (s.tags && s.tags.some(t => t.toLowerCase().includes(lower))),
    )

    if (results.length === 0) {
      return `No skills found matching "${query}".`
    }

    const lines = [`${results.length} skill(s) matching "${query}":`, '']
    for (const s of results.slice(0, 15)) {
      lines.push(`  ${s.skill_id} - ${s.name} (by ${s.owner})`)
      if (s.description) lines.push(`    ${s.description}`)
    }
    return lines.join('\n')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Search failed: ${msg}`
  }
}

async function skillStoreInstall(spec: string): Promise<string> {
  try {
    const id = spec.includes('@') ? (spec.split('@')[0] ?? spec) : spec
    const version = spec.includes('@') ? spec.split('@')[1] : undefined

    const { installSkillFromStore } = await import(
      '../services/skill/skillStore.js'
    )
    const result = await installSkillFromStore(id, version)
    return `Skill "${result.name}" installed to ${result.path}\
Skills are auto-discovered on next conversation turn.`
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Install failed: ${msg}`
  }
}

async function skillStoreUninstall(name: string): Promise<string> {
  const { uninstallSkill } = await import('../services/skill/skillStore.js')
  const ok = uninstallSkill(name)
  return ok ? `Skill "${name}" uninstalled.` : `Skill "${name}" not found.`
}

async function skillStoreInstalledList(): Promise<string> {
  const { listInstalledSkills } = await import(
    '../services/skill/skillStore.js'
  )
  const installed = listInstalledSkills()
  if (installed.length === 0) return 'No skills installed locally.'

  const lines = [`${installed.length} skill(s) installed:`, '']
  for (const s of installed) {
    lines.push(`  ${s.name} - ${s.path}`)
  }
  return lines.join('\n')
}

// ============================================================
// Skill Search (local file-based search)
// ============================================================

let skillSearchEnabled = false

export function isSkillSearchEnabled(): boolean {
  return skillSearchEnabled
}

export function handleSkillSearchCommand(args: string): string {
  const trimmed = args.trim()

  if (!trimmed || trimmed === 'help') {
    return [
      'Skill Search commands (local file-based skill matching):',
      '  /skill-search start   - Enable automatic skill matching each turn',
      '  /skill-search stop    - Disable automatic skill matching',
      '  /skill-search status  - Show current status',
      `Current status: ${skillSearchEnabled ? 'enabled' : 'disabled'}`,
    ].join('\n')
  }

  if (trimmed === 'start') {
    skillSearchEnabled = true
    return 'Skill Search enabled. Skills will be auto-matched each turn.'
  }

  if (trimmed === 'stop') {
    skillSearchEnabled = false
    return 'Skill Search disabled.'
  }

  if (trimmed === 'status') {
    return `Skill Search is ${skillSearchEnabled ? 'enabled' : 'disabled'}.`
  }

  return `Unknown skill-search command: ${trimmed}. Use start, stop, or status.`
}

/**
 * Search local skills by query.
 * Uses simple TF-like scoring (word overlap).
 */
export function searchLocalSkills(skills: Skill[], query: string): Skill[] {
  if (!query.trim()) return []

  const queryWords = query.toLowerCase().split(/\s+/)
  const scored = skills.map(s => {
    const contentLower = s.content.toLowerCase()
    const nameLower = s.name.toLowerCase()
    let score = 0
    for (const w of queryWords) {
      if (nameLower.includes(w)) score += 3
      const count = (
        contentLower.match(
          new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        ) || []
      ).length
      score += count
    }
    return { skill: s, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.skill)
}
