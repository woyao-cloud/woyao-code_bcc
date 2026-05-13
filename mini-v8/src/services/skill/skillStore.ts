// ============================================================
// Skill Store Client for mini-v6
// ============================================================

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
  statSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ============================================================
// Types
// ============================================================

export interface StoreSkill {
  skill_id: string
  name: string
  owner: string
  deprecated?: boolean
  description?: string
  category?: string
  tags?: string[]
  downloads?: number
  created_at?: string
  updated_at?: string
}

export interface StoreSkillVersion {
  version: string
  skill_id: string
  body: string
  created_at?: string
}

export interface SkillStoreConfig {
  storeUrl: string
  apiKey?: string
}

// ============================================================
// Default config
// ============================================================

const DEFAULT_STORE_URL = 'https://api.anthropic.com/v1/skills'

function getStoreConfig(): SkillStoreConfig {
  return {
    storeUrl: process.env.SKILL_STORE_URL || DEFAULT_STORE_URL,
    apiKey: process.env.ANTHROPIC_API_KEY || undefined,
  }
}

function getSkillsInstallDir(): string {
  const dir = join(homedir(), '.claude-code-mini', 'skills')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

// ============================================================
// API operations
// ============================================================

async function storeRequest(path: string): Promise<unknown> {
  const config = getStoreConfig()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (config.apiKey) {
    headers['x-api-key'] = config.apiKey
  }

  const response = await fetch(`${config.storeUrl}${path}`, { headers })
  if (!response.ok) {
    throw new Error(
      `Skill store error: ${response.status} ${response.statusText}`,
    )
  }
  return response.json()
}

/** List all available skills in the store */
export async function listStoreSkills(): Promise<StoreSkill[]> {
  const data = (await storeRequest('?beta=true')) as {
    data?: StoreSkill[]
  }
  return data.data ?? []
}

/** Get a specific skill by ID */
export async function getStoreSkill(id: string): Promise<StoreSkill> {
  return (await storeRequest(`/${id}?beta=true`)) as StoreSkill
}

/** Get versions of a skill */
export async function getStoreSkillVersions(
  id: string,
): Promise<StoreSkillVersion[]> {
  const data = (await storeRequest(`/${id}/versions?beta=true`)) as {
    data?: StoreSkillVersion[]
  }
  return data.data ?? []
}

/** Get a specific version of a skill */
export async function getStoreSkillVersion(
  id: string,
  version: string,
): Promise<StoreSkillVersion> {
  return (await storeRequest(
    `/${id}/versions/${version}?beta=true`,
  )) as StoreSkillVersion
}

// ============================================================
// Local caching
// ============================================================

const CACHE_FILE = 'skill_store_cache.json'

function getCachePath(): string {
  return join(homedir(), '.claude-code-mini', CACHE_FILE)
}

export function loadCachedSkillList(): StoreSkill[] {
  const path = getCachePath()
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as StoreSkill[]
  } catch {
    return []
  }
}

export function saveCachedSkillList(skills: StoreSkill[]): void {
  const path = getCachePath()
  try {
    writeFileSync(path, JSON.stringify(skills, null, 2), 'utf-8')
  } catch {}
}

// ============================================================
// Install/uninstall
// ============================================================

/** Install a skill from the store to local skills directory */
export async function installSkillFromStore(
  id: string,
  version?: string,
): Promise<{ name: string; path: string }> {
  let body: string
  let skillName: string

  if (version) {
    const ver = await getStoreSkillVersion(id, version)
    body = ver.body
    skillName = ver.skill_id
  } else {
    const skill = await getStoreSkill(id)
    const versions = await getStoreSkillVersions(id)
    if (versions.length === 0) {
      throw new Error(`Skill ${id} has no published versions`)
    }
    const sorted = [...versions].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
      return dateB - dateA
    })
    const latest = sorted[0]
    if (!latest) throw new Error(`Skill ${id} has no published versions`)
    body = latest.body
    skillName = skill.name
  }

  const safeName =
    skillName.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || id
  const skillDir = join(getSkillsInstallDir(), safeName)
  const skillPath = join(skillDir, 'SKILL.md')

  mkdirSync(skillDir, { recursive: true })
  writeFileSync(skillPath, body, 'utf-8')

  return { name: safeName, path: skillPath }
}

/** Uninstall a locally installed skill */
export function uninstallSkill(name: string): boolean {
  const skillDir = join(getSkillsInstallDir(), name)
  if (!existsSync(skillDir)) return false
  try {
    rmSync(skillDir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/** List locally installed store skills */
export function listInstalledSkills(): Array<{ name: string; path: string }> {
  const dir = getSkillsInstallDir()
  if (!existsSync(dir)) return []
  const results: Array<{ name: string; path: string }> = []
  try {
    for (const entry of readdirSync(dir)) {
      const skillDir = join(dir, entry)
      if (statSync(skillDir).isDirectory()) {
        results.push({ name: entry, path: skillDir })
      }
    }
  } catch {}
  return results
}
