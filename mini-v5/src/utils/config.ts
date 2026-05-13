import {
  loadUserSettings,
  loadProjectSettings,
  getPermissionMode,
} from './settings/settings.js'

/**
 * Get the global config (user settings merged with project settings)
 */
export function getGlobalConfig(projectRoot: string) {
  const user = loadUserSettings()
  const project = loadProjectSettings(projectRoot)
  return {
    permissionMode: getPermissionMode(projectRoot),
    model: project.model ?? user.model,
    apiKeyHelper: user.apiKeyHelper,
  }
}

/**
 * Check if the user has accepted the trust dialog
 */
export function checkHasTrustDialogAccepted(): boolean {
  // Mini version: always trust
  return true
}
