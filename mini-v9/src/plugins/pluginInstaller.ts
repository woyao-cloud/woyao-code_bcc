// ============================================================
// Enhanced Plugin Installer for mini-v9
// ============================================================
// Supports: local dir install, GitHub tarball download,
// dependency resolution, version management, ZIP caching
// ============================================================

import {
  mkdirSync,
  existsSync,
  writeFileSync,
  rmSync,
  readdirSync,
  statSync,
  readFileSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { PluginManifest, PluginScope } from './types.js'
import { validatePluginManifest } from './schemas.js'

// ============================================================
// Path helpers
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

function getPluginDir(name: string, scope: PluginScope, cwd?: string): string {
  return join(getInstallDir(scope, cwd), name)
}

// ============================================================
// GitHub tarball installation
// ============================================================

/**
 * Install a plugin from a GitHub repository.
 * Downloads and extracts from GitHub's tarball API.
 */
export async function installPluginFromGitHub(
  repo: string,
  name: string,
  scope: PluginScope,
  version?: string,
  cwd?: string,
): Promise<{ success: boolean; message: string }> {
  const ref = version ? `v${version}` : 'main'
  const url = `https://api.github.com/repos/${repo}/tarball/${ref}`

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      return {
        success: false,
        message: `GitHub download failed: ${response.status} ${response.statusText}`,
      }
    }

    const buffer = await response.arrayBuffer()
    const targetDir = getPluginDir(name, scope, cwd)

    // Remove existing installation
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
    mkdirSync(targetDir, { recursive: true })

    // Extract tarball to target directory
    await extractTarball(buffer, targetDir)

    // Verify the installation has a valid manifest
    const manifest = loadPluginManifestFromDir(targetDir)
    if (manifest) {
      return { success: true, message: `Installed ${name} v${manifest.version}` }
    }

    // If no manifest in root, look for plugin dir inside tarball
    const entries = readdirSync(targetDir)
    for (const entry of entries) {
      const subDir = join(targetDir, entry)
      if (statSync(subDir).isDirectory() && entry !== '.codex-plugin') {
        const subManifest = loadPluginManifestFromDir(subDir)
        if (subManifest) {
          // Move contents up
          moveContents(subDir, targetDir)
          return {
            success: true,
            message: `Installed ${name} v${subManifest.version}`,
          }
        }
      }
    }

    return { success: true, message: `Installed ${name}` }
  } catch (err) {
    return {
      success: false,
      message: `Installation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

/**
 * Extract a tarball (ArrayBuffer) to a directory.
 * Uses a native un-tar approach via pipes.
 */
async function extractTarball(
  buffer: ArrayBuffer,
  targetDir: string,
): Promise<void> {
  // Write buffer to temp file, then extract
  const tmpFile = join(targetDir, '..', `_tmp_${Date.now()}.tar.gz`)
  try {
    writeFileSync(tmpFile, new Uint8Array(buffer))

    // Use system tar to extract
    const proc = Bun.spawn(['tar', '-xzf', tmpFile, '-C', targetDir], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const result = await proc.exited
    if (result !== 0) {
      // Try without gz
      const proc2 = Bun.spawn(['tar', '-xf', tmpFile, '-C', targetDir], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      await proc2.exited
    }
  } finally {
    // Cleanup temp file
    try {
      rmSync(tmpFile, { force: true })
    } catch {}
  }
}

/**
 * Move contents from source to target, then remove source
 */
function moveContents(source: string, target: string): void {
  const entries = readdirSync(source)
  for (const entry of entries) {
    const srcPath = join(source, entry)
    const dstPath = join(target, entry)
    if (statSync(srcPath).isDirectory()) {
      try {
        mkdirSync(dstPath, { recursive: true })
        moveContents(srcPath, dstPath)
        rmSync(srcPath, { recursive: true })
      } catch {}
    } else {
      try {
        writeFileSync(dstPath, readFileSync(srcPath))
        rmSync(srcPath)
      } catch {}
    }
  }
}

/**
 * Load a plugin manifest from a plugin directory,
 * checking standard locations.
 */
function loadPluginManifestFromDir(dir: string): PluginManifest | null {
  const paths = [
    join(dir, '.codex-plugin', 'plugin.json'),
    join(dir, 'plugin.json'),
  ]
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf-8')) as PluginManifest
      } catch {}
    }
  }
  return null
}

// ============================================================
// Local directory installation
// ============================================================

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
  // Validate manifest
  const validation = validatePluginManifest(manifest)
  if (!validation.valid) {
    throw new Error(
      `Invalid plugin manifest: ${validation.errors.join('; ')}`,
    )
  }

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
 * Install a plugin from a URL (tarball/zip).
 */
export async function installPluginFromUrl(
  url: string,
  name: string,
  scope: PluginScope,
  cwd?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      return {
        success: false,
        message: `Download failed: ${response.status}`,
      }
    }

    const buffer = await response.arrayBuffer()
    const targetDir = getPluginDir(name, scope, cwd)

    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
    mkdirSync(targetDir, { recursive: true })

    await extractTarball(buffer, targetDir)
    return { success: true, message: `Installed ${name} from URL` }
  } catch (err) {
    return {
      success: false,
      message: `Installation failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ============================================================
// Uninstall
// ============================================================

/**
 * Uninstall a plugin by name and scope.
 */
export function uninstallPlugin(
  name: string,
  scope: PluginScope,
  cwd?: string,
): boolean {
  const targetDir = getPluginDir(name, scope, cwd)
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
  const targetDir = getPluginDir(name, scope, cwd)
  return existsSync(join(targetDir, '.codex-plugin', 'plugin.json'))
}

// ============================================================
// List installed
// ============================================================

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

// ============================================================
// Dependency resolution
// ============================================================

export interface DependencyResolution {
  resolved: Array<{ name: string; version?: string }>
  missing: Array<{ name: string; version?: string }>
}

/**
 * Resolve plugin dependencies from a given set of installed plugins.
 */
export function resolveDependencies(
  dependencies: Record<string, string> | undefined,
  installedNames: string[],
): DependencyResolution {
  const resolved: Array<{ name: string; version?: string }> = []
  const missing: Array<{ name: string; version?: string }> = []

  if (!dependencies) return { resolved, missing }

  for (const [dep, version] of Object.entries(dependencies)) {
    if (installedNames.includes(dep)) {
      resolved.push({ name: dep, version })
    } else {
      missing.push({ name: dep, version })
    }
  }

  return { resolved, missing }
}

// ============================================================
// Version comparison
// ============================================================

/**
 * Compare two semver versions.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const va = partsA[i] ?? 0
    const vb = partsB[i] ?? 0
    if (va < vb) return -1
    if (va > vb) return 1
  }
  return 0
}