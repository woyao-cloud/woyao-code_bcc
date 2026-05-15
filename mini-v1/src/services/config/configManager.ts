/**
 * Configuration system for mini-v7.
 * Reads/writes .claude-code-mini/config.json
 * Supports configurable path via setConfigDir() for testing.
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

let configDir: string = join(homedir(), '.claude-code-mini')
let configFile: string = join(configDir, 'config.json')

let cachedConfig: AppConfig | null = null

/**
 * Override the config directory for testing.
 * Clears the cache so subsequent loadConfig reads from the new location.
 */
export function setConfigDir(dir: string): void {
  configDir = dir
  configFile = join(dir, 'config.json')
  cachedConfig = null
  ensureDir()
}

function ensureDir(): boolean {
  if (existsSync(configDir)) return true
  try {
    mkdirSync(configDir, { recursive: true })
    return true
  } catch {
    return false
  }
}

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig

  if (!ensureDir()) return {}

  try {
    if (!existsSync(configFile)) return {}
    const raw = readFileSync(configFile, 'utf-8')
    cachedConfig = JSON.parse(raw) as AppConfig
    return cachedConfig!
  } catch {
    return {}
  }
}

export function saveConfig(config: AppConfig): void {
  if (!ensureDir()) return
  try {
    writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8')
    cachedConfig = config
  } catch (err) {
    // Surface write errors during tests (process.env.TEST is set by bun test)
    if (process.env.TEST || process.env.NODE_ENV === 'test') {
      throw err
    }
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
