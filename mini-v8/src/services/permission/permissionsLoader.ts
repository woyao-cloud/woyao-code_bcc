import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  parsePermissionRule,
  type PermissionRule,
} from './permissionRuleParser.js'
import type { PermissionMode } from '../../types/permissions.js'

const SETTINGS_DIR = join(homedir(), '.claude-code-mini')
const SETTINGS_FILE = join(SETTINGS_DIR, 'settings.json')

interface Settings {
  permissionMode?: PermissionMode
  permissionRules?: string[]
}

function ensureDir(): void {
  if (!existsSync(SETTINGS_DIR)) {
    mkdirSync(SETTINGS_DIR, { recursive: true })
  }
}

function loadSettings(): Settings {
  ensureDir()
  if (!existsSync(SETTINGS_FILE)) return {}
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8')) as Settings
  } catch {
    return {}
  }
}

function saveSettings(settings: Settings): void {
  ensureDir()
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
}

export function loadPermissionMode(): PermissionMode {
  return loadSettings().permissionMode ?? 'default'
}

export function savePermissionMode(mode: PermissionMode): void {
  const settings = loadSettings()
  settings.permissionMode = mode
  saveSettings(settings)
}

export function loadPermissionRules(): PermissionRule[] {
  const settings = loadSettings()
  const ruleStrings = settings.permissionRules ?? []
  const rules: PermissionRule[] = []
  for (const str of ruleStrings) {
    const result = parsePermissionRule(str, { source: 'settings.json' })
    if (result.success && result.rule) {
      rules.push(result.rule)
    }
  }
  return rules
}

export function addPermissionRule(ruleString: string): boolean {
  const result = parsePermissionRule(ruleString, { source: 'settings.json' })
  if (!result.success || !result.rule) return false

  const settings = loadSettings()
  const rules = settings.permissionRules ?? []
  rules.push(ruleString)
  settings.permissionRules = rules
  saveSettings(settings)
  return true
}

export function removePermissionRule(index: number): boolean {
  const settings = loadSettings()
  const rules = settings.permissionRules ?? []
  if (index < 0 || index >= rules.length) return false
  rules.splice(index, 1)
  settings.permissionRules = rules
  saveSettings(settings)
  return true
}

export function clearPermissionRules(): void {
  const settings = loadSettings()
  delete settings.permissionRules
  saveSettings(settings)
}
