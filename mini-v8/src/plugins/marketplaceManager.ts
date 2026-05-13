// ============================================================
// Marketplace Manager for mini-v6
// ============================================================

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type {
  KnownMarketplace,
  PluginMarketplace,
  PluginMarketplaceEntry,
} from './types.js'

// ============================================================
// Marketplace storage
// ============================================================

function getMarketplacesDir(): string {
  const dir = join(homedir(), '.claude-code-mini', 'marketplaces')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

function getKnownMarketplacesFile(): string {
  return join(getMarketplacesDir(), 'known_marketplaces.json')
}

function getMarketplaceCacheDir(): string {
  const dir = join(getMarketplacesDir(), 'cache')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

// ============================================================
// Official marketplace (default bundled)
// ============================================================

export const OFFICIAL_MARKETPLACE_NAME = 'claude-plugins-official'
export const OFFICIAL_MARKETPLACE_SOURCE =
  'https://api.anthropic.com/v1/marketplace/claude-plugins-official'

// ============================================================
// Known marketplaces CRUD
// ============================================================

export function loadKnownMarketplaces(): Record<string, KnownMarketplace> {
  const file = getKnownMarketplacesFile()
  if (!existsSync(file)) {
    // Initialize with official marketplace
    const defaults: Record<string, KnownMarketplace> = {
      [OFFICIAL_MARKETPLACE_NAME]: {
        source: 'url',
        url: OFFICIAL_MARKETPLACE_SOURCE,
        name: OFFICIAL_MARKETPLACE_NAME,
        autoUpdate: true,
      },
    }
    try {
      writeFileSync(file, JSON.stringify(defaults, null, 2), 'utf-8')
    } catch {}
    return defaults
  }
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as Record<
      string,
      KnownMarketplace
    >
  } catch {
    return {}
  }
}

export function saveKnownMarketplaces(
  marketplaces: Record<string, KnownMarketplace>,
): void {
  const file = getKnownMarketplacesFile()
  try {
    writeFileSync(file, JSON.stringify(marketplaces, null, 2), 'utf-8')
  } catch {}
}

export function addMarketplace(entry: KnownMarketplace): void {
  const marketplaces = loadKnownMarketplaces()
  const name = entry.name || entry.source
  marketplaces[name] = { ...entry, name, lastUpdated: new Date().toISOString() }
  saveKnownMarketplaces(marketplaces)
}

export function removeMarketplace(name: string): boolean {
  const marketplaces = loadKnownMarketplaces()
  if (!marketplaces[name]) return false
  delete marketplaces[name]
  saveKnownMarketplaces(marketplaces)
  return true
}

// ============================================================
// Marketplace cache
// ============================================================

/** Cache a marketplace manifest on disk */
export function cacheMarketplaceManifest(
  name: string,
  manifest: PluginMarketplace,
): void {
  const cachePath = join(getMarketplaceCacheDir(), `${name}.json`)
  try {
    writeFileSync(cachePath, JSON.stringify(manifest, null, 2), 'utf-8')
  } catch {}
}

/** Load a cached marketplace manifest */
export function loadCachedMarketplace(name: string): PluginMarketplace | null {
  const cachePath = join(getMarketplaceCacheDir(), `${name}.json`)
  if (!existsSync(cachePath)) return null
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8')) as PluginMarketplace
  } catch {
    return null
  }
}

/** Fetch a marketplace from URL (with caching built-in) */
export async function fetchMarketplace(
  url: string,
  name: string,
): Promise<PluginMarketplace | null> {
  // Check cache first
  const cached = loadCachedMarketplace(name)
  if (cached) return cached

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const data = (await response.json()) as PluginMarketplace
    cacheMarketplaceManifest(name, data)
    return data
  } catch {
    // Return cached version even if stale
    return cached
  }
}

// ============================================================
// Plugin search in marketplace
// ============================================================

/** Search for plugins in a marketplace manifest by name */
export function searchMarketplacePlugins(
  marketplace: PluginMarketplace,
  query: string,
): PluginMarketplaceEntry[] {
  const lower = query.toLowerCase()
  return marketplace.plugins.filter(
    p =>
      p.name.toLowerCase().includes(lower) ||
      p.description.toLowerCase().includes(lower) ||
      p.tags?.some(t => t.toLowerCase().includes(lower)),
  )
}

/** Get all plugins from a marketplace */
export function getAllMarketplacePlugins(
  marketplace: PluginMarketplace,
): PluginMarketplaceEntry[] {
  return marketplace.plugins
}
