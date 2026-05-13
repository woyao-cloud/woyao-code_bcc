/**
 * Configuration system for mini-v5.
 * Reads/writes .claude-code-mini/config.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface AppConfig {
  model?: string
  maxTurns?: number
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
  theme?: 'dark' | 'light'
  autoCompact?: boolean
}

const CONFIG_DIR = join(homedir(), '.claude-code-mini')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

let cachedConfig: AppConfig | null = null

function ensureDir(): boolean {
  if (existsSync(CONFIG_DIR)) return true
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    return true
  } catch {
    return false
  }
}

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig

  if (!ensureDir()) return {}

  try {
    if (!existsSync(CONFIG_FILE)) return {}
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    cachedConfig = JSON.parse(raw) as AppConfig
    return cachedConfig!
  } catch {
    return {}
  }
}

export function saveConfig(config: AppConfig): void {
  if (!ensureDir()) return
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
    cachedConfig = config
  } catch {
    // Fail silently
  }
}

export function updateConfig(updates: Partial<AppConfig>): AppConfig {
  const current = loadConfig()
  const merged = { ...current, ...updates }
  saveConfig(merged)
  return merged
}

export function clearConfigCache(): void {
  cachedConfig = null
}
