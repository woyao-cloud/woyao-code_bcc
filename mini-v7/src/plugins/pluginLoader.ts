// ============================================================
// Plugin Loader for mini-v6
// ============================================================

import { readFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { PluginManifest, LoadedPlugin, PluginScope } from './types.js'

// ============================================================
// Plugin directory constants
// ============================================================

function getPluginsHome(): string {
  const dir = join(homedir(), '.claude-code-mini', 'plugins')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

function getProjectPluginsDir(cwd: string): string {
  return join(cwd, '.codex', 'plugins')
}

/** Get all directories where plugins may be installed */
export function getPluginInstallDirs(cwd: string): Map<PluginScope, string> {
  const dirs = new Map<PluginScope, string>()
  dirs.set('user', getPluginsHome())
  dirs.set('project', getProjectPluginsDir(cwd))
  dirs.set('bundled', join(import.meta.dir ?? '', '..', 'plugins', 'bundled'))
  return dirs
}

// ============================================================
// Manifest loading
// ============================================================

const MANIFEST_PATH = '.codex-plugin/plugin.json'

/** Load a plugin manifest from a directory */
export function loadPluginManifest(pluginDir: string): PluginManifest | null {
  const manifestPath = join(pluginDir, MANIFEST_PATH)
  if (!existsSync(manifestPath)) return null
  try {
    const raw = readFileSync(manifestPath, 'utf-8')
    const manifest = JSON.parse(raw) as PluginManifest
    if (!manifest.name || !manifest.version) return null
    return manifest
  } catch {
    return null
  }
}

// ============================================================
// Plugin discovery & loading
// ============================================================

/**
 * Discover and load all installed plugins from all scopes.
 */
export function loadAllPlugins(cwd: string): LoadedPlugin[] {
  const plugins: LoadedPlugin[] = []
  const installDirs = getPluginInstallDirs(cwd)

  for (const [scope, dir] of installDirs) {
    if (!existsSync(dir)) continue
    try {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        const pluginDir = join(dir, entry)
        try {
          if (!statSync(pluginDir).isDirectory()) continue
          const manifest = loadPluginManifest(pluginDir)
          if (!manifest) continue
          plugins.push({
            pluginId: `${manifest.name}@${scope === 'bundled' ? 'bundled' : scope}`,
            manifest,
            installPath: pluginDir,
            marketplace: scope === 'bundled' ? 'bundled' : '',
            scope,
            enabled: true,
            errors: [],
          })
        } catch {}
      }
    } catch {}
  }

  return plugins
}

/**
 * Get skill files contributed by all plugins.
 */
export function getPluginSkillFiles(
  loadedPlugins: LoadedPlugin[],
): Array<{ name: string; path: string; content: string }> {
  const skills: Array<{ name: string; path: string; content: string }> = []
  for (const plugin of loadedPlugins) {
    if (!plugin.manifest.skills) continue
    for (const skillDef of plugin.manifest.skills) {
      const skillPath = join(plugin.installPath, skillDef.path)
      if (existsSync(skillPath)) {
        try {
          const content = readFileSync(skillPath, 'utf-8').slice(0, 5000)
          skills.push({ name: skillDef.name, path: skillPath, content })
        } catch {}
      }
    }
  }
  return skills
}

/**
 * Create a plugin id for a plugin from a marketplace.
 */
export function createPluginId(name: string, marketplace: string): string {
  return `${name}@${marketplace}`
}

/**
 * Parse a plugin spec (name@marketplace or name) into components.
 */
export function parsePluginSpec(spec: string): {
  name: string
  marketplace?: string
} {
  const atIdx = spec.lastIndexOf('@')
  if (atIdx > 0) {
    return { name: spec.slice(0, atIdx), marketplace: spec.slice(atIdx + 1) }
  }
  return { name: spec }
}
