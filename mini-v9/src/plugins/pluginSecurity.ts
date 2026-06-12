// ============================================================
// Plugin Security: Blocklist, Policy, and Validation
// ============================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { PluginManifest, PluginScope } from './types.js'

// ============================================================
// Security storage
// ============================================================

function getSecurityDir(): string {
  const dir = join(homedir(), '.claude-code-mini', 'security')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

function getBlocklistFile(): string {
  return join(getSecurityDir(), 'plugin_blocklist.json')
}

function getPolicyFile(): string {
  return join(getSecurityDir(), 'plugin_policy.json')
}

// ============================================================
// Blocklist
// ============================================================

export interface BlocklistEntry {
  /** Plugin name */
  name: string
  /** Reason for blocking */
  reason: string
  /** When it was blocked */
  timestamp: number
  /** Source of the blocklist entry (user, policy, flag) */
  source: 'user' | 'policy' | 'flag'
}

export type PluginBlocklist = Record<string, BlocklistEntry>

export function loadBlocklist(): PluginBlocklist {
  const file = getBlocklistFile()
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as PluginBlocklist
  } catch {
    return {}
  }
}

export function saveBlocklist(blocklist: PluginBlocklist): void {
  try {
    writeFileSync(getBlocklistFile(), JSON.stringify(blocklist, null, 2), 'utf-8')
  } catch {}
}

export function addToBlocklist(
  name: string,
  reason: string,
  source: 'user' | 'policy' | 'flag' = 'user',
): void {
  const blocklist = loadBlocklist()
  blocklist[name] = { name, reason, timestamp: Date.now(), source }
  saveBlocklist(blocklist)
}

export function removeFromBlocklist(name: string): boolean {
  const blocklist = loadBlocklist()
  if (!blocklist[name]) return false
  delete blocklist[name]
  saveBlocklist(blocklist)
  return true
}

export function isBlocked(name: string): BlocklistEntry | undefined {
  const blocklist = loadBlocklist()
  return blocklist[name]
}

// ============================================================
// Plugin Flagging (user-reported concerns)
// ============================================================

export interface PluginFlagEntry {
  pluginName: string
  reason: string
  flaggedBy: string
  timestamp: number
}

export function flagPlugin(
  name: string,
  reason: string,
  flaggedBy: string = 'user',
): void {
  const blocklist = loadBlocklist()
  // Only add to blocklist if not already there
  if (!blocklist[name]) {
    addToBlocklist(name, reason, 'flag')
  }
}

// ============================================================
// Policy Management
// ============================================================

export interface PluginPolicy {
  /** When set, only plugins in this allowlist can be installed */
  allowlist: string[] | null
  /** When set, only these marketplace sources are allowed */
  allowedSources: ('github' | 'url' | 'directory')[] | null
  /** Maximum number of plugins allowed */
  maxPlugins: number | null
  /** Whether to require validation on install */
  requireValidation: boolean
  /** Plugin scope restrictions ('user' only, 'project' only, or both) */
  allowedScopes: PluginScope[]
}

export const DEFAULT_POLICY: PluginPolicy = {
  allowlist: null,
  allowedSources: null,
  maxPlugins: null,
  requireValidation: true,
  allowedScopes: ['user', 'project', 'bundled'],
}

export function loadPolicy(): PluginPolicy {
  const file = getPolicyFile()
  if (!existsSync(file)) return { ...DEFAULT_POLICY }
  try {
    return { ...DEFAULT_POLICY, ...JSON.parse(readFileSync(file, 'utf-8')) }
  } catch {
    return { ...DEFAULT_POLICY }
  }
}

export function savePolicy(policy: PluginPolicy): void {
  try {
    writeFileSync(getPolicyFile(), JSON.stringify(policy, null, 2), 'utf-8')
  } catch {}
}

// ============================================================
// Install Validation
// ============================================================

export interface InstallCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * Check if a plugin is allowed to be installed based on security policy.
 */
export function checkInstallAllowed(
  name: string,
  scope: PluginScope,
  source?: string,
): InstallCheckResult {
  // 1. Check blocklist
  const blocked = isBlocked(name)
  if (blocked) {
    return { allowed: false, reason: `Plugin "${name}" is blocked: ${blocked.reason}` }
  }

  // 2. Check policy allowlist
  const policy = loadPolicy()
  if (policy.allowlist && !policy.allowlist.includes(name)) {
    return { allowed: false, reason: `Plugin "${name}" is not in the allowlist` }
  }

  // 3. Check scope restrictions
  if (!policy.allowedScopes.includes(scope)) {
    return { allowed: false, reason: `Plugin scope "${scope}" is not allowed` }
  }

  // 4. Check source restrictions
  if (policy.allowedSources && source) {
    const allowed = policy.allowedSources.some(s => source.includes(s))
    if (!allowed) {
      return { allowed: false, reason: `Plugin source "${source}" is not allowed` }
    }
  }

  // 5. Check max plugins
  if (policy.maxPlugins !== null) {
    // Note: actual count check happens at install time
  }

  return { allowed: true }
}

// ============================================================
// Manifest Validation (enhanced with security checks)
// ============================================================

export interface SecureValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Enhanced validation with security checks.
 */
export function validatePluginSecurity(
  manifest: PluginManifest,
): SecureValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Name security
  if (!manifest.name || !/^[a-z0-9._-]+$/i.test(manifest.name)) {
    errors.push(
      'Plugin name can only contain letters, numbers, dots, hyphens, and underscores',
    )
  }

  // 2. Check for suspicious entry points
  if (manifest.commands) {
    for (const cmd of manifest.commands) {
      if (cmd.entry?.includes('..') || cmd.entry?.startsWith('/') || cmd.entry?.startsWith('\\')) {
        errors.push(
          `Command "${cmd.name}" has a suspicious entry point: ${cmd.entry}`,
        )
      }
    }
  }

  // 3. Check for dangerous MCP configurations
  if (manifest.mcpServers) {
    for (const mcp of manifest.mcpServers) {
      if (mcp.command?.includes('rm ') || mcp.command?.includes('del ')) {
        warnings.push(
          `MCP server "${mcp.name}" uses a destructive command: ${mcp.command}`,
        )
      }
    }
  }

  // 4. Check for absolute paths in dependencies
  if (manifest.dependencies) {
    for (const [dep, ver] of Object.entries(manifest.dependencies)) {
      if (dep.startsWith('/') || dep.startsWith('..')) {
        errors.push(`Dependency "${dep}" uses an absolute or relative path`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ============================================================
// Plugin quarantine (disabled but kept on disk)
// ============================================================

export interface QuarantineEntry {
  name: string
  reason: string
  timestamp: number
  originalScope: PluginScope
}

export function quarantinePlugin(
  name: string,
  reason: string,
  scope: PluginScope,
): void {
  addToBlocklist(name, `Quarantined: ${reason}`, 'policy')
}