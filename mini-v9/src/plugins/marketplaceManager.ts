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
import type { MarketplaceSource } from './schemas.js'
import {
  OFFICIAL_MARKETPLACE_NAME as SCHEMA_OFFICIAL_NAME,
  OFFICIAL_MARKETPLACE_SOURCE as SCHEMA_OFFICIAL_SOURCE,
  validateMarketplaceName,
} from './schemas.js'

// Export official constants from schemas for backward compat
export const OFFICIAL_MARKETPLACE_NAME = SCHEMA_OFFICIAL_NAME
export const OFFICIAL_MARKETPLACE_SOURCE =
  'https://api.anthropic.com/v1/marketplace/claude-plugins-official'

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
// Default marketplaces
// ============================================================

function getDefaultMarketplaces(): Record<string, KnownMarketplace> {
  return {
    [OFFICIAL_MARKETPLACE_NAME]: {
      source: 'url',
      url: OFFICIAL_MARKETPLACE_SOURCE,
      name: OFFICIAL_MARKETPLACE_NAME,
      autoUpdate: true,
    },
  }
}

// ============================================================
// Known marketplaces CRUD
// ============================================================

export function loadKnownMarketplaces(): Record<string, KnownMarketplace> {
  const file = getKnownMarketplacesFile()
  if (!existsSync(file)) {
    const defaults = getDefaultMarketplaces()
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

  // Validate name
  const validation = validateMarketplaceName(name)
  if (!validation.valid) {
    throw new Error(validation.reason ?? 'Invalid marketplace name')
  }

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
// GitHub marketplace fetching
// ============================================================

/**
 * Transform a GitHub repo marketplace source to a URL-based fetch.
 * Uses github.com API to get the raw marketplace JSON.
 */
function getGitHubMarketplaceUrl(source: MarketplaceSource): string | null {
  if (source.source !== 'github' || !source.repo) return null
  const ref = source.ref ?? 'main'
  return `https://raw.githubusercontent.com/${source.repo}/${ref}/marketplace.json`
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

/**
 * Invalidate marketplace cache (forces re-fetch on next access)
 */
export function invalidateMarketplaceCache(name: string): void {
  const cachePath = join(getMarketplaceCacheDir(), `${name}.json`)
  if (existsSync(cachePath)) {
    try {
      writeFileSync(cachePath, '', 'utf-8')
    } catch {}
  }
}

/**
 * Get the fetch URL for a marketplace based on its config.
 */
export function getMarketplaceFetchUrl(
  entry: KnownMarketplace,
): string | null {
  if (entry.url) return entry.url

  // GitHub source
  if (entry.repo) {
    const source: MarketplaceSource = {
      source: 'github',
      repo: entry.repo,
      ref: entry.ref,
    }
    return getGitHubMarketplaceUrl(source)
  }

  // Git source
  if (entry.source === 'git' && entry.url) {
    return entry.url
  }

  return null
}

/**
 * Fetch or retrieve a marketplace manifest.
 * 1. Try cache (if not force).
 * 2. Try URL fetch.
 * 3. Try GitHub API (if repo source).
 * 4. Fallback to cache if fetch fails.
 */
export async function fetchMarketplace(
  urlOrEntry: string | KnownMarketplace,
  name?: string,
  forceRefresh = false,
): Promise<PluginMarketplace | null> {
  let url: string | null
  let marketplaceName: string

  if (typeof urlOrEntry === 'string') {
    url = urlOrEntry
    marketplaceName = name ?? urlOrEntry
  } else {
    marketplaceName = name ?? urlOrEntry.name ?? 'unknown'
    url = getMarketplaceFetchUrl(urlOrEntry)
  }

  if (!url) return null

  // Check cache (unless force refresh)
  if (!forceRefresh) {
    const cached = loadCachedMarketplace(marketplaceName)
    if (cached) return cached
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const data = (await response.json()) as PluginMarketplace
    cacheMarketplaceManifest(marketplaceName, data)
    return data
  } catch {
    // Return cached version even if stale
    return loadCachedMarketplace(marketplaceName)
  }
}

// ============================================================
// Marketplace helpers (extracted from full version)
// ============================================================

/**
 * Format plugin failure details for user display
 */
export function formatFailureDetails(
  failures: Array<{ name: string; reason?: string; error?: string }>,
  includeReasons: boolean,
): string {
  const maxShow = 2
  const details = failures
    .slice(0, maxShow)
    .map(f => {
      const reason = f.reason || f.error || 'unknown error'
      return includeReasons ? `${f.name} (${reason})` : f.name
    })
    .join(includeReasons ? '; ' : ', ')

  const remaining = failures.length - maxShow
  const moreText = remaining > 0 ? ` and ${remaining} more` : ''

  return `${details}${moreText}`
}

/**
 * Load marketplaces with graceful degradation
 */
export async function loadMarketplacesWithGracefulDegradation(
  config: Record<string, KnownMarketplace>,
): Promise<{
  marketplaces: Array<{
    name: string
    config: KnownMarketplace
    data: PluginMarketplace | null
  }>
  failures: Array<{ name: string; error: string }>
}> {
  const marketplaces: Array<{
    name: string
    config: KnownMarketplace
    data: PluginMarketplace | null
  }> = []
  const failures: Array<{ name: string; error: string }> = []

  for (const [name, entry] of Object.entries(config)) {
    try {
      const data = await fetchMarketplace(entry, name)
      if (data) {
        marketplaces.push({ name, config: entry, data })
      } else {
        failures.push({ name, error: 'Failed to fetch marketplace' })
      }
    } catch (err) {
      failures.push({
        name,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { marketplaces, failures }
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
