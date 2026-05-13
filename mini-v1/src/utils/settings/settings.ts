import { existsSync, readFileSync } from 'fs'
import { isEnvTruthy } from '../envUtils.js'
import { getGlobalSettingsPath, getProjectSettingsPath } from './managedPath.js'
import {
  getUserSettingsCache,
  setUserSettingsCache,
  getProjectSettingsCache,
  setProjectSettingsCache,
} from './settingsCache.js'
import type { UserSettings, ProjectSettings } from './types.js'
import { DEFAULT_SETTINGS } from './constants.js'

/**
 * Load settings from a JSON file
 */
function loadJSONFile<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

/**
 * Load user settings from ~/.claude/settings.json
 */
export function loadUserSettings(): UserSettings {
  if (getUserSettingsCache()) {
    return getUserSettingsCache()!
  }
  const path = getGlobalSettingsPath()
  const settings = loadJSONFile<UserSettings>(path) ?? {}
  setUserSettingsCache(settings)
  return settings
}

/**
 * Load project settings from <.project>/.claude/settings.json
 */
export function loadProjectSettings(projectRoot: string): ProjectSettings {
  if (getProjectSettingsCache()) {
    return getProjectSettingsCache()!
  }
  const path = getProjectSettingsPath(projectRoot)
  const settings = loadJSONFile<ProjectSettings>(path) ?? {}
  setProjectSettingsCache(settings)
  return settings
}

/**
 * Get the resolved permission mode (project > user > default)
 */
export function getPermissionMode(projectRoot: string): string {
  const userSettings = loadUserSettings()
  const projectSettings = loadProjectSettings(projectRoot)
  return (
    projectSettings.permissionMode ??
    userSettings.permissionMode ??
    DEFAULT_SETTINGS.permissionMode
  )
}

/**
 * Get the model override, if any
 */
export function getModelOverride(projectRoot: string): string | undefined {
  const userSettings = loadUserSettings()
  const projectSettings = loadProjectSettings(projectRoot)
  return projectSettings.model ?? userSettings.model
}

/**
 * Get the API key from settings or environment
 */
export function getAPIKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY
}

/**
 * Apply settings environment variables
 */
export function applySettingsEnv(): void {
  const userSettings = loadUserSettings()
  if (userSettings.env) {
    for (const [key, value] of Object.entries(userSettings.env)) {
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  }
}
