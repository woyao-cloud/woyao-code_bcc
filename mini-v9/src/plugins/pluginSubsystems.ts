// ============================================================
// Plugin Subsystem Loading: Agents, Commands, Hooks
// ============================================================
// Plugins can contribute:
// - Agent definitions (loaded from .md files or .ts modules)
// - CLI commands (registered at runtime)
// - Hooks (lifecycle hooks for events)
// - Skills (contributed skill files)
// - MCP servers (registered on startup)
// ============================================================

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { LoadedPlugin, PluginCommandDef } from './types.js'

// ============================================================
// Agent loading from plugins
// ============================================================

export interface PluginAgentDef {
  name: string
  description: string
  pluginId: string
  content: string // SKILL.md or agent definition content
}

/**
 * Discover agent definitions from all loaded plugins.
 * Agents are defined as .md files in a plugin's agents/ directory.
 */
export function loadPluginAgents(plugins: LoadedPlugin[]): PluginAgentDef[] {
  const agents: PluginAgentDef[] = []

  for (const plugin of plugins) {
    if (!plugin.enabled) continue

    const agentsDir = join(plugin.installPath, 'agents')
    if (!existsSync(agentsDir)) continue

    try {
      const entries = readdirSync(agentsDir)
      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue
        const agentPath = join(agentsDir, entry)
        if (!statSync(agentPath).isFile()) continue

        try {
          const content = readFileSync(agentPath, 'utf-8')
          const name = entry.replace(/\.md$/, '')
          const description = extractDescription(content)

          agents.push({
            name,
            description,
            pluginId: plugin.pluginId,
            content,
          })
        } catch {}
      }
    } catch {}
  }

  return agents
}

/**
 * Extract the first line or heading from markdown content as a description.
 */
function extractDescription(content: string): string {
  // Try first heading
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch) return headingMatch[1].trim()

  // Try first non-empty line
  const firstLine = content.split('\n').find(l => l.trim().length > 0)
  if (firstLine) return firstLine.trim().slice(0, 100)

  return 'No description'
}

// ============================================================
// Command loading from plugins
// ============================================================

export interface PluginLoadedCommand {
  name: string
  description: string
  pluginId: string
  handler: () => Promise<string>
}

/**
 * Load command handlers from plugins.
 * Commands are registered via the plugin's manifest command definitions.
 */
export function loadPluginCommands(
  plugins: LoadedPlugin[],
): PluginLoadedCommand[] {
  const commands: PluginLoadedCommand[] = []

  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    if (!plugin.manifest.commands) continue

    for (const cmd of plugin.manifest.commands) {
      commands.push({
        name: cmd.name,
        description: cmd.description,
        pluginId: plugin.pluginId,
        handler: async () => {
          // Execute the command's entry file
          const entryPath = join(plugin.installPath, cmd.entry)
          if (!existsSync(entryPath)) {
            return `Error: Command "${cmd.name}" entry not found: ${cmd.entry}`
          }
          try {
            const result = await import(entryPath)
            if (typeof result.default === 'function') {
              return await result.default()
            }
            return `Command "${cmd.name}" executed`
          } catch (err) {
            return `Error executing command "${cmd.name}": ${err instanceof Error ? err.message : String(err)}`
          }
        },
      })
    }
  }

  return commands
}

// ============================================================
// MCP Server loading from plugins
// ============================================================

export interface PluginMcpServerConfig {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  pluginId: string
}

/**
 * Collect MCP server configurations from plugins.
 */
export function loadPluginMcpServers(
  plugins: LoadedPlugin[],
): PluginMcpServerConfig[] {
  const servers: PluginMcpServerConfig[] = []

  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    if (!plugin.manifest.mcpServers) continue

    for (const mcpDef of plugin.manifest.mcpServers) {
      servers.push({
        name: mcpDef.name,
        command: mcpDef.command,
        args: mcpDef.args,
        env: mcpDef.env,
        pluginId: plugin.pluginId,
      })
    }
  }

  return servers
}

// ============================================================
// Skill loading from plugins
// ============================================================

export interface PluginSubSkillDef {
  name: string
  description: string
  content: string
  pluginId: string
}

/**
 * Load skill definitions from plugins.
 * Skills are defined in the plugin manifest's skills array.
 */
export function loadPluginSkills(plugins: LoadedPlugin[]): PluginSubSkillDef[] {
  const skills: PluginSubSkillDef[] = []

  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    if (!plugin.manifest.skills) continue

    for (const skillDef of plugin.manifest.skills) {
      const skillPath = join(plugin.installPath, skillDef.path)
      if (!existsSync(skillPath)) continue

      try {
        const content = readFileSync(skillPath, 'utf-8')
        skills.push({
          name: skillDef.name,
          description: skillDef.description,
          content,
          pluginId: plugin.pluginId,
        })
      } catch {}
    }
  }

  return skills
}

// ============================================================
// Hook loading from plugins
// ============================================================

export type PluginHookType =
  | 'pre_tool_execution'
  | 'post_tool_execution'
  | 'pre_message_send'
  | 'post_message_receive'
  | 'on_startup'
  | 'on_shutdown'

export interface PluginHook {
  type: PluginHookType
  pluginId: string
  handler: (context: Record<string, unknown>) => Promise<void>
}

/**
 * Hooks system: plugins can register lifecycle hooks.
 */
const pluginHooks: PluginHook[] = []

export function registerPluginHook(hook: PluginHook): void {
  pluginHooks.push(hook)
}

export function getPluginHooks(type?: PluginHookType): PluginHook[] {
  if (type) return pluginHooks.filter(h => h.type === type)
  return [...pluginHooks]
}

export function clearPluginHooks(): void {
  pluginHooks.length = 0
}

// ============================================================
// Bulk registration: load all subsystems from plugins
// ============================================================

export interface PluginSubsystems {
  agents: PluginAgentDef[]
  commands: PluginLoadedCommand[]
  mcpServers: PluginMcpServerConfig[]
  skills: PluginSubSkillDef[]
}

/**
 * Load all subsystems from a set of enabled plugins.
 */
export function loadAllPluginSubsystems(
  plugins: LoadedPlugin[],
): PluginSubsystems {
  return {
    agents: loadPluginAgents(plugins),
    commands: loadPluginCommands(plugins),
    mcpServers: loadPluginMcpServers(plugins),
    skills: loadPluginSkills(plugins),
  }
}

/**
 * Reload hooks from plugins (replaces all hooks).
 */
export function reloadPluginHooks(plugins: LoadedPlugin[]): void {
  clearPluginHooks()
  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    if (!plugin.manifest.hooks) continue
    for (const hookType of plugin.manifest.hooks as PluginHookType[]) {
      registerPluginHook({
        type: hookType,
        pluginId: plugin.pluginId,
        handler: async (_ctx: Record<string, unknown>) => {
          // Hook execution - actual logic would be plugin-specific
        },
      })
    }
  }
}
