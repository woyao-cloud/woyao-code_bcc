// ============================================================
// Enhanced Plugin REPL Commands for mini-v9
// ============================================================

import type { LoadedPlugin, PluginScope } from '../plugins/types.js'
import { validatePluginManifest } from '../plugins/schemas.js'

// ============================================================
// Main handler
// ============================================================

export async function handlePluginCommand(
  trimmed: string,
  loadedPlugins: () => LoadedPlugin[],
  cwd: string,
): Promise<string> {
  const args = trimmed.slice('/plugin'.length).trim()

  if (!args || args === 'help') return pluginHelp()

  // Installation
  if (args.startsWith('install ') || args.startsWith('i ')) {
    const spec = args.slice(args.indexOf(' ') + 1).trim()
    return pluginInstall(spec, cwd, loadedPlugins)
  }

  // Uninstall
  if (args.startsWith('uninstall ') || args.startsWith('rm ')) {
    const spec = args.slice(args.indexOf(' ') + 1).trim()
    return pluginUninstall(spec, cwd)
  }

  // List
  if (args === 'list' || args === 'ls') {
    return pluginList(loadedPlugins())
  }

  // Enable / disable
  if (args.startsWith('enable ')) return pluginEnable(args.slice('enable '.length).trim(), cwd)
  if (args.startsWith('disable ')) return pluginDisable(args.slice('disable '.length).trim(), cwd)

  // Info
  if (args.startsWith('info ')) {
    const name = args.slice('info '.length).trim()
    return pluginInfo(name, loadedPlugins())
  }

  // Browse marketplace
  if (args === 'browse' || args.startsWith('browse ')) {
    const query = args.startsWith('browse ') ? args.slice('browse '.length).trim() : ''
    return pluginBrowse(query)
  }

  // Search marketplace
  if (args.startsWith('search ')) {
    const query = args.slice('search '.length).trim()
    return pluginBrowse(query)
  }

  // Validate a plugin
  if (args.startsWith('validate ')) {
    const name = args.slice('validate '.length).trim()
    return pluginValidate(name, loadedPlugins())
  }

  // Check updates
  if (args === 'check-updates' || args === 'updates') {
    return pluginCheckUpdates(cwd, loadedPlugins())
  }

  // Marketplace management
  if (args.startsWith('marketplace')) {
    const sub = args.slice('marketplace'.length).trim()
    return marketplaceCommand(sub)
  }

  // Blocklist management
  if (args.startsWith('blocklist')) {
    const sub = args.slice('blocklist'.length).trim()
    return blocklistCommand(sub)
  }

  // Policy management
  if (args.startsWith('policy')) {
    const sub = args.slice('policy'.length).trim()
    return policyCommand(sub)
  }

  return `Unknown plugin command: ${args}\nUse /plugin help for usage.`
}

// ============================================================
// Help
// ============================================================

function pluginHelp(): string {
  return [
    'Plugin commands:',
    '  /plugin list                    - List installed plugins',
    '  /plugin install <name@mp>       - Install a plugin',
    '  /plugin uninstall <name>        - Uninstall a plugin',
    '  /plugin enable <name>           - Enable a plugin',
    '  /plugin disable <name>          - Disable a plugin',
    '  /plugin info <name>             - Show plugin details',
    '  /plugin validate <name>         - Validate plugin integrity',
    '  /plugin browse [query]          - Browse marketplace',
    '  /plugin search <query>          - Search marketplace plugins',
    '  /plugin check-updates           - Check for plugin updates',
    '',
    'Marketplace:',
    '  /plugin marketplace list                - List marketplaces',
    '  /plugin marketplace add <url|github>    - Add marketplace',
    '  /plugin marketplace remove <name>       - Remove marketplace',
    '  /plugin marketplace refresh [name]      - Refresh cache',
    '',
    'Security:',
    '  /plugin blocklist list                  - Show blocklist',
    '  /plugin blocklist add <name> <reason>   - Block a plugin',
    '  /plugin blocklist remove <name>         - Unblock a plugin',
    '  /plugin policy                          - Show policy',
    '  /plugin policy allowlist <...names>     - Set allowlist (empty = none)',
    '',
  ].join('\n')
}

// ============================================================
// List installed
// ============================================================

function pluginList(plugins: LoadedPlugin[]): string {
  if (plugins.length === 0) return 'No plugins installed.'

  const lines = [`${plugins.length} plugin(s) installed:`, '']
  for (const p of plugins) {
    const status = p.enabled ? '✅ enabled' : '⛔ disabled'
    const errors = p.errors.length > 0 ? ` ${p.errors.length} error(s)` : ''
    lines.push(
      `  ${p.manifest.name} v${p.manifest.version} [${p.scope}] ${status}${errors}`,
    )
    if (p.manifest.description) {
      lines.push(`    ${p.manifest.description.slice(0, 80)}`)
    }
  }
  return lines.join('\n')
}

// ============================================================
// Info
// ============================================================

function pluginInfo(name: string, plugins: LoadedPlugin[]): string {
  const plugin = plugins.find(p => p.manifest.name === name)
  if (!plugin) return `Plugin "${name}" not found.`

  const m = plugin.manifest
  const lines = [
    `Plugin: ${m.name} v${m.version}`,
    `  Description: ${m.description ?? 'N/A'}`,
    `  Scope: ${plugin.scope}`,
    `  Status: ${plugin.enabled ? 'enabled' : 'disabled'}`,
    `  Path: ${plugin.installPath}`,
  ]
  if (m.author) lines.push(`  Author: ${m.author}`)
  if (m.homepage) lines.push(`  Homepage: ${m.homepage}`)
  if (m.license) lines.push(`  License: ${m.license}`)
  if (m.category) lines.push(`  Category: ${m.category}`)
  if (m.tags?.length) lines.push(`  Tags: ${m.tags.join(', ')}`)
  if (m.dependencies) lines.push(`  Dependencies: ${Object.keys(m.dependencies).join(', ')}`)
  if (m.commands?.length) lines.push(`  Commands: ${m.commands.map(c => c.name).join(', ')}`)
  if (m.skills?.length) lines.push(`  Skills: ${m.skills.map(s => s.name).join(', ')}`)
  if (m.mcpServers?.length) lines.push(`  MCP servers: ${m.mcpServers.map(s => s.name).join(', ')}`)
  if (plugin.errors.length > 0) {
    lines.push('  Errors:')
    for (const e of plugin.errors) lines.push(`    - ${e.message}`)
  }
  return lines.join('\n')
}

// ============================================================
// Validate
// ============================================================

async function pluginValidate(name: string, plugins: LoadedPlugin[]): Promise<string> {
  const plugin = plugins.find(p => p.manifest.name === name)
  if (!plugin) return `Plugin "${name}" not found.`

  const { validatePluginSecurity } = await import('../plugins/pluginSecurity.js')
  const manifest = plugin.manifest
  const basicCheck = validatePluginManifest(manifest)
  const securityCheck = validatePluginSecurity(manifest)

  const lines = [`Validation results for "${name}":`, '']

  if (basicCheck.valid && securityCheck.valid) {
    lines.push('✅ Plugin is valid')
  }
  if (basicCheck.errors.length > 0) {
    lines.push('❌ Manifest errors:')
    for (const e of basicCheck.errors) lines.push(`  - ${e}`)
  }
  if (securityCheck.errors.length > 0) {
    lines.push('❌ Security issues:')
    for (const e of securityCheck.errors) lines.push(`  - ${e}`)
  }
  if (basicCheck.warnings.length > 0) {
    lines.push('⚠️  Warnings:')
    for (const w of basicCheck.warnings) lines.push(`  - ${w}`)
  }
  if (securityCheck.warnings.length > 0) {
    for (const w of securityCheck.warnings) lines.push(`  - ${w}`)
  }

  return lines.join('\n')
}

// ============================================================
// Install
// ============================================================

async function pluginInstall(
  spec: string,
  cwd: string,
  loadedPlugins: () => LoadedPlugin[],
): Promise<string> {
  const { parsePluginSpec } = await import('../plugins/pluginLoader.js')
  const {
    installPluginFromDir,
    installPluginFromGitHub,
    installPluginFromUrl,
    isPluginInstalledAt,
  } = await import('../plugins/pluginInstaller.js')
  const {
    fetchMarketplace,
    loadKnownMarketplaces,
  } = await import('../plugins/marketplaceManager.js')
  const { checkInstallAllowed } = await import('../plugins/pluginSecurity.js')

  const { name, marketplace } = parsePluginSpec(spec)

  // GitHub shorthand: user/repo format
  if (name.includes('/') && !marketplace) {
    const allowed = checkInstallAllowed(name, 'user', 'github')
    if (!allowed.allowed) return `❌ ${allowed.reason}`

    const result = await installPluginFromGitHub(name, name.split('/')[1], 'user', undefined, cwd)
    return result.success
      ? `✅ ${result.message}`
      : `❌ ${result.message}`
  }

  // URL install
  if (name.startsWith('http://') || name.startsWith('https://')) {
    const result = await installPluginFromUrl(name, 'plugin-from-url', 'user', cwd)
    return result.success
      ? `✅ ${result.message}`
      : `❌ ${result.message}`
  }

  if (!marketplace) {
    return [
      `Plugin spec must include marketplace: ${name}@<marketplace>`,
      '  Use /plugin marketplace add to add a marketplace first.',
      '  Or use GitHub shorthand: owner/repo',
      '  Example: /plugin install my-plugin@claude-plugins-official',
    ].join('\n')
  }

  const known = loadKnownMarketplaces()
  const mp = known[marketplace]
  if (!mp) return `Marketplace "${marketplace}" not found.`

  // Security check
  const allowed = checkInstallAllowed(name, 'user')
  if (!allowed.allowed) return `❌ ${allowed.reason}`

  const pluginMarketplace = await fetchMarketplace(mp, marketplace, false)
  if (!pluginMarketplace) return `Failed to fetch marketplace "${marketplace}".`

  const entry = pluginMarketplace.plugins.find(p => p.name === name)
  if (!entry) return `Plugin "${name}" not found in marketplace "${marketplace}".`

  if (isPluginInstalledAt(name, 'user', cwd)) return `Plugin "${name}" is already installed.`

  // Check dependencies
  const { resolveDependencies } = await import('../plugins/pluginInstaller.js')
  const installed = (await import('../plugins/pluginLoader.js')).loadAllPlugins(cwd)
  const depCheck = resolveDependencies(
    entry.dependencies,
    installed.map(p => p.manifest.name),
  )
  if (depCheck.missing.length > 0) {
    return [
      `Plugin "${name}" has missing dependencies:`,
      ...depCheck.missing.map(d => `  - ${d.name} (${d.version ?? 'any'})`),
      'Install them first with /plugin install <name>@<marketplace>',
    ].join('\n')
  }

  // Install from marketplace
  const manifest = {
    name: entry.name,
    version: entry.version,
    description: entry.description,
    author: entry.author,
    homepage: entry.homepage,
    repository: entry.repository,
    license: entry.license,
    category: entry.category,
    tags: entry.tags,
    minAppVersion: entry.minAppVersion,
    dependencies: entry.dependencies,
  }

  const { validatePluginSecurity } = await import('../plugins/pluginSecurity.js')
  const secCheck = validatePluginSecurity(manifest)
  if (!secCheck.valid) {
    return [
      `❌ Plugin "${name}" failed security validation:`,
      ...secCheck.errors.map(e => `  - ${e}`),
    ].join('\n')
  }

  installPluginFromDir('', manifest, 'user', cwd)
  const depInfo =
    depCheck.resolved.length > 0
      ? ` Dependencies resolved: ${depCheck.resolved.map(d => d.name).join(', ')}`
      : ''
  return `✅ Plugin "${name}@${marketplace}" installed!${depInfo}`
}

// ============================================================
// Uninstall
// ============================================================

async function pluginUninstall(spec: string, cwd: string): Promise<string> {
  const { parsePluginSpec } = await import('../plugins/pluginLoader.js')
  const { uninstallPlugin } = await import('../plugins/pluginInstaller.js')

  const { name } = parsePluginSpec(spec)
  for (const scope of ['user', 'project'] as PluginScope[]) {
    if (uninstallPlugin(name, scope, cwd)) {
      return `✅ Plugin "${name}" uninstalled from ${scope} scope.`
    }
  }
  return `Plugin "${name}" not found.`
}

// ============================================================
// Enable / Disable
// ============================================================

async function pluginEnable(name: string, cwd: string): Promise<string> {
  const { loadAllPlugins } = await import('../plugins/pluginLoader.js')
  const plugins = loadAllPlugins(cwd)
  const plugin = plugins.find(p => p.manifest.name === name)
  if (!plugin) return `Plugin "${name}" not found.`
  if (plugin.enabled) return `Plugin "${name}" is already enabled.`
  plugin.enabled = true
  return `✅ Plugin "${name}" enabled.`
}

async function pluginDisable(name: string, cwd: string): Promise<string> {
  const { loadAllPlugins } = await import('../plugins/pluginLoader.js')
  const plugins = loadAllPlugins(cwd)
  const plugin = plugins.find(p => p.manifest.name === name)
  if (!plugin) return `Plugin "${name}" not found.`
  if (!plugin.enabled) return `Plugin "${name}" is already disabled.`
  plugin.enabled = false
  return `⛔ Plugin "${name}" disabled.`
}

// ============================================================
// Browse / Search marketplace
// ============================================================

async function pluginBrowse(query?: string): Promise<string> {
  const {
    loadKnownMarketplaces,
    fetchMarketplace,
    searchMarketplacePlugins,
    getAllMarketplacePlugins,
  } = await import('../plugins/marketplaceManager.js')

  const marketplaces = loadKnownMarketplaces()
  const lines: string[] = []

  for (const [name, config] of Object.entries(marketplaces)) {
    lines.push(`\n📦 ${name}:`)
    try {
      const data = await fetchMarketplace(config, name, false)
      if (!data) {
        lines.push('  (unavailable)')
        continue
      }
      const plugins = query
        ? searchMarketplacePlugins(data, query)
        : getAllMarketplacePlugins(data).slice(0, 20)

      if (plugins.length === 0) {
        lines.push(query ? `  No plugins matching "${query}"` : '  (empty)')
      } else {
        for (const p of plugins) {
          const tags = p.tags?.length ? ` [${p.tags.slice(0, 3).join(', ')}]` : ''
          lines.push(`  • ${p.name} v${p.version} — ${p.description.slice(0, 60)}${tags}`)
        }
      }
    } catch {
      lines.push('  (error fetching)')
    }
  }

  return lines.join('\n')
}

// ============================================================
// Check updates
// ============================================================

async function pluginCheckUpdates(cwd: string, plugins: LoadedPlugin[]): Promise<string> {
  const { checkPluginUpdates } = await import('../plugins/pluginLifecycle.js')
  const updates = await checkPluginUpdates(plugins)

  const available = updates.filter(u => u.updateAvailable)
  if (available.length === 0) return '✅ All plugins are up to date.'

  const lines = [`${available.length} update(s) available:`, '']
  for (const u of available) {
    lines.push(`  • ${u.pluginId}: ${u.currentVersion} → ${u.latestVersion}`)
  }
  return lines.join('\n')
}

// ============================================================
// Marketplace management
// ============================================================

async function marketplaceCommand(args: string): Promise<string> {
  const {
    loadKnownMarketplaces,
    addMarketplace,
    removeMarketplace,
    invalidateMarketplaceCache,
    fetchMarketplace,
  } = await import('../plugins/marketplaceManager.js')

  if (!args || args === 'list') {
    const marketplaces = loadKnownMarketplaces()
    const names = Object.keys(marketplaces)
    if (names.length === 0) return 'No marketplaces configured.'
    const lines = [`${names.length} marketplace(s):`, '']
    for (const name of names) {
      const mp = marketplaces[name]
      if (!mp) continue
      lines.push(`  • ${name} — ${mp.url || mp.repo || mp.source || 'N/A'}`)
    }
    return lines.join('\n')
  }

  if (args.startsWith('add ')) {
    const input = args.slice('add '.length).trim()
    if (!input) return 'Usage: /plugin marketplace add <url|github:owner/repo>'

    if (input.startsWith('github:')) {
      const repo = input.slice('github:'.length)
      addMarketplace({ source: 'url', repo, name: repo.split('/')[1] ?? repo, autoUpdate: true })
      return `✅ GitHub marketplace added: ${repo}`
    }

    if (input.includes('github.com')) {
      const match = input.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/)
      if (match) {
        addMarketplace({ source: 'url', repo: match[1], name: match[1].split('/')[1], autoUpdate: true })
        return `✅ GitHub marketplace added: ${match[1]}`
      }
    }

    addMarketplace({ source: 'url', url: input, autoUpdate: false })
    return `✅ Marketplace added: ${input}`
  }

  if (args.startsWith('remove ')) {
    const name = args.slice('remove '.length).trim()
    if (!name) return 'Usage: /plugin marketplace remove <name>'
    return removeMarketplace(name)
      ? `✅ Marketplace "${name}" removed.`
      : `Marketplace "${name}" not found.`
  }

  if (args === 'refresh' || args.startsWith('refresh ')) {
    const name = args.startsWith('refresh ') ? args.slice('refresh '.length).trim() : undefined
    if (name) {
      invalidateMarketplaceCache(name)
      const data = await fetchMarketplace(name, name, true)
      return data ? `✅ Marketplace "${name}" refreshed.` : `Failed to refresh "${name}".`
    }
    const marketplaces = loadKnownMarketplaces()
    for (const n of Object.keys(marketplaces)) invalidateMarketplaceCache(n)
    await Promise.all(
      Object.entries(marketplaces).map(([n, c]) => fetchMarketplace(c, n, true)),
    )
    return '✅ All marketplaces refreshed.'
  }

  return `Unknown marketplace command: ${args}\nUse: list, add <url|github:repo>, remove <name>, refresh [name]`
}

// ============================================================
// Blocklist management
// ============================================================

async function blocklistCommand(args: string): Promise<string> {
  const {
    loadBlocklist,
    addToBlocklist,
    removeFromBlocklist,
  } = await import('../plugins/pluginSecurity.js')

  if (!args || args === 'list') {
    const blocklist = loadBlocklist()
    const entries = Object.values(blocklist)
    if (entries.length === 0) return 'Blocklist is empty.'
    const lines = [`${entries.length} blocked plugin(s):`, '']
    for (const e of entries) {
      const date = new Date(e.timestamp).toLocaleDateString()
      lines.push(`  • ${e.name} — ${e.reason} (${date}, source: ${e.source})`)
    }
    return lines.join('\n')
  }

  if (args.startsWith('add ')) {
    const rest = args.slice('add '.length).trim()
    const match = rest.match(/^(\S+)\s+(.+)$/)
    if (!match) return 'Usage: /plugin blocklist add <name> <reason>'
    addToBlocklist(match[1], match[2], 'user')
    return `✅ Plugin "${match[1]}" blocked: ${match[2]}`
  }

  if (args.startsWith('remove ')) {
    const name = args.slice('remove '.length).trim()
    if (!name) return 'Usage: /plugin blocklist remove <name>'
    return removeFromBlocklist(name)
      ? `✅ Plugin "${name}" unblocked.`
      : `Plugin "${name}" not in blocklist.`
  }

  return 'Unknown blocklist command. Use: list, add <name> <reason>, remove <name>'
}

// ============================================================
// Policy management
// ============================================================

async function policyCommand(args: string): Promise<string> {
  const { loadPolicy, savePolicy, DEFAULT_POLICY } = await import('../plugins/pluginSecurity.js')

  if (!args || args === 'show') {
    const p = loadPolicy()
    return [
      'Plugin security policy:',
      `  Allowlist: ${p.allowlist ? (p.allowlist.length > 0 ? p.allowlist.join(', ') : '(empty - none allowed)') : '(none - all allowed)'}`,
      `  Allowed sources: ${p.allowedSources ? p.allowedSources.join(', ') : '(all)'}`,
      `  Max plugins: ${p.maxPlugins ?? '(unlimited)'}`,
      `  Require validation: ${p.requireValidation}`,
      `  Allowed scopes: ${p.allowedScopes.join(', ')}`,
    ].join('\n')
  }

  if (args.startsWith('allowlist ')) {
    const rest = args.slice('allowlist '.length).trim()
    const names = rest ? rest.split(/\s+/) : []
    const p = loadPolicy()
    p.allowlist = names.length > 0 ? names : null
    savePolicy(p)
    return names.length > 0
      ? `✅ Allowlist set: ${names.join(', ')}`
      : '✅ Allowlist cleared (all plugins allowed)'
  }

  return 'Unknown policy command. Use: show, allowlist [...names]'
}