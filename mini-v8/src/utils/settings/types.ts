/**
 * Settings types for the mini CLI
 */

export interface UserSettings {
  permissionMode?: string
  model?: string
  apiKeyHelper?: string
  env?: Record<string, string>
}

export interface ProjectSettings {
  permissionMode?: string
  model?: string
  additionalWorkingDirectories?: string[]
  permissions?: {
    allow?: string[]
    deny?: string[]
  }
}
