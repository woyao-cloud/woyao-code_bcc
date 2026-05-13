// ============================================================
// Plugin Installer for mini-v6
// ============================================================

import {
  mkdirSync,
  existsSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { PluginManifest, PluginScope } from './types.js'

// ============================================================
// Installation helpers
// ============================================================

function getPluginsHome(): string {
  const dir = join(homedir(), '.claude-code-mini', 'plugins')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

function getInstallDir(scope: PluginScope, cwd?: string): string {
  if (scope === 'user') return getPluginsHome()
  if (scope === 'project' && cwd) return join(cwd, '.codex', 'plugins')
  return getPluginsHome()
}

/**
 * Install a plugin from a local directory path.
 * Copies the plugin to the appropriate scope directory.
 */
export function installPluginFromDir(
  sourcePath: string,
  manifest: PluginManifest,
  scope: PluginScope,
  cwd?: string,
): string {
  const installDir = getInstallDir(scope, cwd)
  const targetDir = join(installDir, manifest.name)

  // Remove existing installation if present
  if (existsSync(targetDir)) {
    try {
      rmSync(targetDir, { recursive: true, force: true })
    } catch {}
  }

  mkdirSync(targetDir, { recursive: true })

  // Create the plugin metadata directory
  const metadataDir = join(targetDir, '.codex-plugin')
  mkdirSync(metadataDir, { recursive: true })

  // Write the manifest
  writeFileSync(
    join(metadataDir, 'plugin.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  )

  return targetDir
}

/**
 * Uninstall a plugin by name and scope.
 */
export function uninstallPlugin(
  name: string,
  scope: PluginScope,
  cwd?: string,
): boolean {
  const installDir = getInstallDir(scope, cwd)
  const targetDir = join(installDir, name)

  if (!existsSync(targetDir)) return false

  try {
    rmSync(targetDir, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

/**
 * Check if a plugin is installed at a given scope.
 */
export function isPluginInstalledAt(
  name: string,
  scope: PluginScope,
  cwd?: string,
): boolean {
  const installDir = getInstallDir(scope, cwd)
  const targetDir = join(installDir, name)
  return existsSync(join(targetDir, '.codex-plugin', 'plugin.json'))
}

/**
 * List all installed plugin names across all scopes.
 */
export function listInstalledPlugins(
  cwd: string,
): Array<{ name: string; scope: PluginScope }> {
  const results: Array<{ name: string; scope: PluginScope }> = []

  for (const scope of ['user', 'project'] as PluginScope[]) {
    const dir = getInstallDir(scope, cwd)
    if (!existsSync(dir)) continue
    try {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        const fullPath = join(dir, entry)
        if (statSync(fullPath).isDirectory()) {
          results.push({ name: entry, scope })
        }
      }
    } catch {}
  }

  return results
}
