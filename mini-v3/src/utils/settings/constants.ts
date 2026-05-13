/**
 * Settings constants
 */

export type SettingSource =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'flagSettings'
  | 'policySettings'
  | 'cliArg'

export const SETTINGS_FILE_NAME = 'settings.json'

export const DEFAULT_SETTINGS = {
  permissionMode: 'default' as const,
  model: undefined as string | undefined,
}
