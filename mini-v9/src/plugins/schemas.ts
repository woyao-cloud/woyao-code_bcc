/**
 * Enhanced Marketplace types for mini-v9
 * Aligned with full-version plugin system
 */

import type { PluginManifest } from './types.js'

// ============================================================
// Marketplace Sources
// ============================================================

export type MarketplaceSource =
  | { source: 'github'; repo: string; ref?: string }
  | { source: 'url'; url: string }
  | { source: 'git'; url: string; ref?: string }
  | { source: 'directory'; path: string }
  | { source: 'file'; path: string }
  | { source: 'settings'; name: string }

export type KnownMarketplace = {
  source: string
  url?: string
  repo?: string
  ref?: string
  path?: string
  installLocation?: string
  autoUpdate?: boolean
  name?: string
  lastUpdated?: string
}

export type PluginMarketplaceEntry = {
  name: string
  version: string
  description: string
  author?: string
  homepage?: string
  repository: string
  license?: string
  category?: string
  tags?: string[]
  downloadUrl?: string
  dependencies?: Record<string, string>
  minAppVersion?: string
  /** GitHub repo for install (owner/repo) */
  githubRepo?: string
}

export type PluginMarketplace = {
  name: string
  description?: string
  version: string
  plugins: PluginMarketplaceEntry[]
}

// ============================================================
// Official Marketplace Constants
// ============================================================

export const OFFICIAL_MARKETPLACE_NAME = 'claude-plugins-official'
export const OFFICIAL_MARKETPLACE_SOURCE: MarketplaceSource = {
  source: 'github',
  repo: 'anthropics/claude-plugins-official',
}

export const OFFICIAL_MARKETPLACE_NAMES = new Set([
  'claude-plugins-official',
  'anthropic-marketplace',
  'anthropic-plugins',
])

// ============================================================
// Name Validation
// ============================================================

/** Pattern to detect impersonation of official marketplaces */
export const BLOCKED_OFFICIAL_NAME_PATTERN =
  /(?:official[^a-z0-9]*(anthropic|claude)|(?:anthropic|claude)[^a-z0-9]*official|^(?:anthropic|claude)[^a-z0-9]*(marketplace|plugins|official))/i

/** Pattern to detect non-ASCII homograph attack characters */
export const NON_ASCII_PATTERN = /[^ -~]/

/**
 * Validate a marketplace name for security concerns
 */
export function validateMarketplaceName(name: string): {
  valid: boolean
  reason?: string
} {
  if (OFFICIAL_MARKETPLACE_NAMES.has(name.toLowerCase())) {
    return { valid: true }
  }
  if (BLOCKED_OFFICIAL_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      reason: 'Name appears to impersonate an official Anthropic marketplace',
    }
  }
  if (NON_ASCII_PATTERN.test(name)) {
    return {
      valid: false,
      reason: 'Marketplace names must only contain ASCII characters',
    }
  }
  return { valid: true }
}

// ============================================================
// Auto-update
// ============================================================

export const NO_AUTO_UPDATE_OFFICIAL_MARKETPLACES = new Set([
  'knowledge-work-plugins',
])

export function isMarketplaceAutoUpdate(
  marketplaceName: string,
  entry: { autoUpdate?: boolean },
): boolean {
  const name = marketplaceName.toLowerCase()
  return (
    entry.autoUpdate ??
    (OFFICIAL_MARKETPLACE_NAMES.has(name) &&
      !NO_AUTO_UPDATE_OFFICIAL_MARKETPLACES.has(name))
  )
}

// ============================================================
// Plugin Validation
// ============================================================

export interface PluginValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate a plugin manifest for completeness and correctness
 */
export function validatePluginManifest(
  manifest: PluginManifest,
): PluginValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!manifest.name || !manifest.name.trim()) {
    errors.push('Plugin name is required')
  } else if (!/^[a-z0-9_-]+$/i.test(manifest.name)) {
    errors.push('Plugin name must only contain letters, numbers, hyphens, and underscores')
  }

  if (!manifest.version) {
    errors.push('Plugin version is required')
  }

  if (!manifest.description) {
    warnings.push('Plugin has no description')
  }

  if (manifest.dependencies) {
    for (const [dep, ver] of Object.entries(manifest.dependencies)) {
      if (!ver.match(/^[\d.]+$/)) {
        warnings.push(`Invalid dependency version for "${dep}": ${ver}`)
      }
    }
  }

  if (manifest.commands) {
    for (const cmd of manifest.commands) {
      if (!cmd.entry) {
        errors.push(`Command "${cmd.name}" has no entry point`)
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ============================================================
// Source Display
// ============================================================

export function getMarketplaceSourceDisplay(
  source: MarketplaceSource,
): string {
  switch (source.source) {
    case 'github':
      return source.repo
    case 'url':
      return source.url
    case 'git':
      return source.url
    case 'directory':
      return source.path
    case 'file':
      return source.path
    case 'settings':
      return `settings:${source.name}`
    default:
      return 'Unknown source'
  }
}