// ============================================================
// Plugin manifest types for mini-v6
// ============================================================

/** A plugin manifest (.codex-plugin/plugin.json) */
export interface PluginManifest {
  name: string
  version: string
  description: string
  author?: string
  homepage?: string
  repository?: string
  license?: string
  category?: string
  tags?: string[]
  /** Commands provided by this plugin */
  commands?: PluginCommandDef[]
  /** Skills provided by this plugin */
  skills?: PluginSkillDef[]
  /** MCP servers provided by this plugin */
  mcpServers?: PluginMcpServerDef[]
  /** Other plugins this depends on */
  dependencies?: Record<string, string>
  /** Minimum claude-code-mini version */
  minAppVersion?: string
}

/** A command definition in a plugin */
export interface PluginCommandDef {
  name: string
  description: string
  /** File relative to plugin root to load */
  entry: string
  /** If true, runs immediately without waiting for other events */
  immediate?: boolean
}

/** A skill definition in a plugin */
export interface PluginSkillDef {
  name: string
  description: string
  /** Path to SKILL.md relative to plugin root */
  path: string
}

/** An MCP server definition in a plugin */
export interface PluginMcpServerDef {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

/** A loaded plugin instance */
export interface LoadedPlugin {
  /** Unique plugin id (name@marketplace or name for bundled) */
  pluginId: string
  /** The plugin manifest */
  manifest: PluginManifest
  /** Absolute path to the plugin directory */
  installPath: string
  /** The marketplace this plugin came from, or 'bundled' */
  marketplace: string
  /** Installation scope */
  scope: PluginScope
  /** Whether the plugin is currently enabled */
  enabled: boolean
  /** Plugin errors during load */
  errors: PluginError[]
}

export type PluginScope = 'user' | 'project' | 'local' | 'bundled'

export interface PluginError {
  message: string
  fatal: boolean
}

/** Marketplace entry for a plugin */
export interface PluginMarketplaceEntry {
  name: string
  version: string
  description: string
  author?: string
  homepage?: string
  repository: string
  license?: string
  category?: string
  tags?: string[]
  /** URL to download the plugin tarball */
  downloadUrl?: string
  /** Required dependencies */
  dependencies?: Record<string, string>
  /** Min app version required */
  minAppVersion?: string
}

/** A marketplace (collection of plugins) */
export interface PluginMarketplace {
  name: string
  description?: string
  version: string
  plugins: PluginMarketplaceEntry[]
}

/** Configuration for a known marketplace */
export interface KnownMarketplace {
  source: string
  /** URL to fetch the marketplace manifest */
  url?: string
  /** GitHub repo (owner/repo format) */
  repo?: string
  /** Git ref to checkout */
  ref?: string
  installLocation?: string
  autoUpdate?: boolean
  name?: string
  lastUpdated?: string
}
