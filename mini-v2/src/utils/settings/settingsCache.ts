import type { UserSettings, ProjectSettings } from './types.js'

/**
 * Simple in-memory settings cache
 */
let userSettingsCache: UserSettings | null = null
let projectSettingsCache: ProjectSettings | null = null

export function setUserSettingsCache(settings: UserSettings | null): void {
  userSettingsCache = settings
}

export function getUserSettingsCache(): UserSettings | null {
  return userSettingsCache
}

export function setProjectSettingsCache(
  settings: ProjectSettings | null,
): void {
  projectSettingsCache = settings
}

export function getProjectSettingsCache(): ProjectSettings | null {
  return projectSettingsCache
}

export function resetSettingsCache(): void {
  userSettingsCache = null
  projectSettingsCache = null
}
