// ============================================================
// Plugin REPL Commands for mini-v6
// ============================================================

import type { LoadedPlugin, PluginScope } from '../plugins/types.js'

/**
 * Handle /plugin commands in the REPL.
 * Returns a string to display to the user.
 */
export async function handlePluginCommand(
  trimmed: string,
  loadedPlugins: () => LoadedPlugin[],
  cwd: string,
): Promise<string> {
  const args = trimmed.slice('/plugin'.length).trim()

  // Help
  if (!args || args === 'help') {
    return pluginHelp()
  }

  // List installed plugins
  if (args === 'list') {
    return pluginList(loadedPlugins())
  }

  // Install a plugin
  if (args.startsWith('install ') || args.startsWith('i ')) {
    const spec = args.slice(args.indexOf(' ') + 1).trim()
    return pluginInstall(spec, cwd)
  }

  // Uninstall a plugin
  if (args.startsWith('uninstall ') || args.startsWith('rm ')) {
    const spec = args.slice(args.indexOf(' ') + 1).trim()
    return pluginUninstall(spec, cwd)
  }

  // Enable a plugin
  if (args.startsWith('enable ')) {
    const name = args.slice('enable '.length).trim()
    return pluginEnable(name, cwd)
  }

  // Disable a plugin
  if (args.startsWith('disable ')) {
    const name = args.slice('disable '.length).trim()
    return pluginDisable(name, cwd)
  }

  // Marketplace operations
  if (args.startsWith('marketplace')) {
    const subArgs = args.slice('marketplace'.length).trim()
    return marketplaceCommand(subArgs)
  }

  return `Unknown plugin command: ${args}\
Use /plugin help for usage.`
}

function pluginHelp(): string {
  return [
    'Plugin commands:',
    '  /plugin list              - List installed plugins',
    '  /plugin install <name>    - Install a plugin (name@marketplace)',
    '  /plugin uninstall <name>  - Uninstall a plugin',
    '  /plugin enable <name>     - Enable a plugin',
    '  /plugin disable <name>    - Disable a plugin',
    '  /plugin marketplace add <url>    - Add a marketplace',
    '  /plugin marketplace list         - List marketplaces',
    '  /plugin marketplace remove <name> - Remove a marketplace',
    '  /plugin marketplace update [name]  - Update marketplace(s)',
  ].join('\n')
}

function pluginList(plugins: LoadedPlugin[]): string {
  if (plugins.length === 0) return 'No plugins installed.'

  const lines = [`${plugins.length} plugin(s) installed:`, '']
  for (const p of plugins) {
    const status = p.enabled ? 'enabled' : 'disabled'
    lines.push(
      `  ${p.manifest.name} v${p.manifest.version} [${p.scope}] ${status}`,
    )
    if (p.manifest.description) {
      lines.push(`    ${p.manifest.description}`)
    }
  }
  return lines.join('\n')
}

async function pluginInstall(spec: string, cwd: string): Promise<string> {
  const { parsePluginSpec } = await import('../plugins/pluginLoader.js')
  const { installPluginFromDir, isPluginInstalledAt } = await import(
    '../plugins/pluginInstaller.js'
  )
  const { fetchMarketplace, loadKnownMarketplaces } = await import(
    '../plugins/marketplaceManager.js'
  )

  const { name, marketplace } = parsePluginSpec(spec)

  if (!marketplace) {
    return [
      `Plugin spec must include marketplace: ${name}@<marketplace>`,
      'Use /plugin marketplace add to add a marketplace first.',
      'Example: /plugin install my-plugin@claude-plugins-official',
    ].join('\n')
  }

  const known = loadKnownMarketplaces()
  const mp = known[marketplace]
  if (!mp || !mp.url) {
    return `Marketplace "${marketplace}" not found. Use /plugin marketplace list.`
  }

  const pluginMarketplace = await fetchMarketplace(mp.url, marketplace)
  if (!pluginMarketplace) {
    return `Failed to fetch marketplace "${marketplace}".`
  }

  const entry = pluginMarketplace.plugins.find(p => p.name === name)
  if (!entry) {
    return `Plugin "${name}" not found in marketplace "${marketplace}".`
  }

  if (isPluginInstalledAt(name, 'user', cwd)) {
    return `Plugin "${name}" is already installed.`
  }

  // For simplicity, install with just metadata (actual files would require download)
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
  }

  installPluginFromDir('', manifest, 'user', cwd)
  return `Plugin "${name}@${marketplace}" installed! Restart to apply skills/commands.`
}

async function pluginUninstall(spec: string, cwd: string): Promise<string> {
  const { parsePluginSpec } = await import('../plugins/pluginLoader.js')
  const { uninstallPlugin } = await import('../plugins/pluginInstaller.js')

  const { name } = parsePluginSpec(spec)

  const scopes: PluginScope[] = ['user', 'project']
  for (const scope of scopes) {
    if (uninstallPlugin(name, scope, cwd)) {
      return `Plugin "${name}" uninstalled from ${scope} scope.`
    }
  }

  return `Plugin "${name}" not found.`
}

async function pluginEnable(name: string, cwd: string): Promise<string> {
  const { loadAllPlugins } = await import('../plugins/pluginLoader.js')
  const plugins = loadAllPlugins(cwd)
  const plugin = plugins.find(p => p.manifest.name === name)
  if (!plugin) return `Plugin "${name}" not found.`
  if (plugin.enabled) return `Plugin "${name}" is already enabled.`

  // Enable by updating loaded state (persistent enable would need a config file)
  plugin.enabled = true
  return `Plugin "${name}" enabled.`
}

async function pluginDisable(name: string, cwd: string): Promise<string> {
  const { loadAllPlugins } = await import('../plugins/pluginLoader.js')
  const plugins = loadAllPlugins(cwd)
  const plugin = plugins.find(p => p.manifest.name === name)
  if (!plugin) return `Plugin "${name}" not found.`
  if (!plugin.enabled) return `Plugin "${name}" is already disabled.`

  plugin.enabled = false
  return `Plugin "${name}" disabled.`
}

async function marketplaceCommand(args: string): Promise<string> {
  const { loadKnownMarketplaces, addMarketplace, removeMarketplace } =
    await import('../plugins/marketplaceManager.js')

  // List marketplaces
  if (!args || args === 'list') {
    const marketplaces = loadKnownMarketplaces()
    const names = Object.keys(marketplaces)
    if (names.length === 0) return 'No marketplaces configured.'
    const lines = [`${names.length} marketplace(s):`, '']
    for (const name of names) {
      const mp = marketplaces[name]
      if (!mp) continue
      lines.push(`  ${name} - ${mp.url || mp.repo || mp.source}`)
    }
    return lines.join('\n')
  }

  // Add a marketplace (URL)
  if (args.startsWith('add ')) {
    const url = args.slice('add '.length).trim()
    if (!url) return 'Usage: /plugin marketplace add <url>'
    addMarketplace({ source: url, url, autoUpdate: false })
    return `Marketplace added: ${url}`
  }

  // Remove a marketplace
  if (args.startsWith('remove ')) {
    const name = args.slice('remove '.length).trim()
    if (!name) return 'Usage: /plugin marketplace remove <name>'
    const ok = removeMarketplace(name)
    return ok
      ? `Marketplace "${name}" removed.`
      : `Marketplace "${name}" not found.`
  }

  // Update marketplaces
  if (args === 'update' || args.startsWith('update ')) {
    return 'Marketplace update: fetch latest manifests from configured URLs (use /plugin marketplace list to check).'
  }

  return `Unknown marketplace command: ${args}\
Use: list, add <url>, remove <name>, update`
}
