import { homedir } from 'os'
import { join } from 'path'

/**
 * Get the path to the global Claude config directory
 */
export function getGlobalConfigDir(): string {
  return join(homedir(), '.claude')
}

/**
 * Get the path to the global settings file
 */
export function getGlobalSettingsPath(): string {
  return join(getGlobalConfigDir(), 'settings.json')
}

/**
 * Get the path to the project settings file
 */
export function getProjectSettingsPath(projectRoot: string): string {
  return join(projectRoot, '.claude', 'settings.json')
}
