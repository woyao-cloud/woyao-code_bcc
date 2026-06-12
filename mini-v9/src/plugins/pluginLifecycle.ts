// ============================================================
// Plugin Lifecycle: Auto-update & Startup Checks
// ============================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { LoadedPlugin } from './types.js'
import { loadAllPlugins, loadPluginManifest } from './pluginLoader.js'
import { compareVersions } from './pluginInstaller.js'
import { loadKnownMarketplaces, fetchMarketplace } from './marketplaceManager.js'
import { isMarketplaceAutoUpdate } from './schemas.js'

// ============================================================
// Update storage
// ============================================================

function getUpdateDir(): string {
  const dir = join(homedir(), '.claude-code-mini', 'updates')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

function getUpdateStateFile(): string {
  return join(getUpdateDir(), 'plugin_update_state.json')
}

export interface PluginVersionState {
  /** Current installed version */
  installedVersion: string
  /** Latest available version (from marketplace) */
  latestVersion?: string
  /** When last checked for updates */
  lastCheckTimestamp?: number
  /** Whether update is pending */
  updateAvailable: boolean
}

type PluginVersionMap = Record<string, PluginVersionState>

function loadVersionStates(): PluginVersionMap {
  const file = getUpdateStateFile()
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as PluginVersionMap
  } catch {
    return {}
  }
}

function saveVersionStates(states: PluginVersionMap): void {
  try {
    writeFileSync(getUpdateStateFile(), JSON.stringify(states, null, 2), 'utf-8')
  } catch {}
}

// ============================================================
// Update checking
// ============================================================

export interface UpdateCheckResult {
  pluginId: string
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

/**
 * Check for plugin updates against their marketplace.
 */
export async function checkPluginUpdates(
  loadedPlugins: LoadedPlugin[],
): Promise<UpdateCheckResult[]> {
  const results: UpdateCheckResult[] = []
  const marketplaces = loadKnownMarketplaces()
  const versionStates = loadVersionStates()

  for (const plugin of loadedPlugins) {
    if (plugin.scope === 'bundled') continue // Skip bundled plugins

    const marketplaceConfig = marketplaces[plugin.marketplace]
    if (!marketplaceConfig) continue

    // Check if auto-update is enabled for this marketplace
    if (!isMarketplaceAutoUpdate(plugin.marketplace, marketplaceConfig)) continue

    const state = versionStates[plugin.pluginId] ?? {
      installedVersion: plugin.manifest.version,
      updateAvailable: false,
    }

    try {
      const marketplace = await fetchMarketplace(marketplaceConfig, plugin.marketplace)
      if (!marketplace) continue

      const marketplaceEntry = marketplace.plugins.find(
        p => p.name === plugin.manifest.name,
      )
      if (!marketplaceEntry) continue

      const latestVersion = marketplaceEntry.version
      const updateAvailable =
        compareVersions(latestVersion, state.installedVersion) > 0

      results.push({
        pluginId: plugin.pluginId,
        currentVersion: state.installedVersion,
        latestVersion,
        updateAvailable,
      })

      versionStates[plugin.pluginId] = {
        ...state,
        latestVersion,
        lastCheckTimestamp: Date.now(),
        updateAvailable,
      }
    } catch {
      // Skip on error
    }
  }

  saveVersionStates(versionStates)
  return results
}

// ============================================================
// Startup checks
// ============================================================

export interface StartupCheckResult {
  healthy: boolean
  issues: Array<{
    pluginId: string
    severity: 'error' | 'warning'
    message: string
  }>
}

/**
 * Run startup checks on all plugins.
 */
export function runStartupChecks(cwd: string): StartupCheckResult {
  const issues: StartupCheckResult['issues'] = []
  const plugins = loadAllPlugins(cwd)

  for (const plugin of plugins) {
    // 1. Verify manifest is still loadable
    const manifest = loadPluginManifest(plugin.installPath)
    if (!manifest) {
      issues.push({
        pluginId: plugin.pluginId,
        severity: 'error',
        message: 'Plugin manifest is missing or invalid',
      })
      continue
    }

    // 2. Check version format
    if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
      issues.push({
        pluginId: plugin.pluginId,
        severity: 'warning',
        message: `Plugin version "${manifest.version}" doesn't follow semver`,
      })
    }

    // 3. Check that command entry files exist
    if (manifest.commands) {
      for (const cmd of manifest.commands) {
        const entryPath = join(plugin.installPath, cmd.entry)
        if (!existsSync(entryPath)) {
          issues.push({
            pluginId: plugin.pluginId,
            severity: 'error',
            message: `Command "${cmd.name}" entry file missing: ${cmd.entry}`,
          })
        }
      }
    }

    // 4. Check that skill files exist
    if (manifest.skills) {
      for (const skill of manifest.skills) {
        const skillPath = join(plugin.installPath, skill.path)
        if (!existsSync(skillPath)) {
          issues.push({
            pluginId: plugin.pluginId,
            severity: 'warning',
            message: `Skill "${skill.name}" file missing: ${skill.path}`,
          })
        }
      }
    }
  }

  return {
    healthy: issues.filter(i => i.severity === 'error').length === 0,
    issues,
  }
}

// ============================================================
// Scheduled update check (called by cron trigger)
// ============================================================

/**
 * Perform update check and return summary.
 * Designed to be called by a cron/scheduler.
 */
export async function scheduledUpdateCheck(cwd: string): Promise<string> {
  const plugins = loadAllPlugins(cwd)
  const updates = await checkPluginUpdates(plugins)

  const available = updates.filter(u => u.updateAvailable)
  if (available.length === 0) return 'All plugins are up to date'

  return available
    .map(
      u =>
        `${u.pluginId}: ${u.currentVersion} → ${u.latestVersion}`,
    )
    .join('\n')
}