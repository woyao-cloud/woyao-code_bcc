import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

export function registerMcpCommand(
  getMcpEntries: () => Array<{
    serverName: string
    connection: { close: () => void }
    tools: Array<{ name: string; description: string }>
  }>,
): void {
  registerCommand({
    name: 'mcp',
    description: 'MCP server management: list status of connected servers',
    usage: '/mcp <list|status|config>',
    handler: (ctx: CommandContext) => {
      const sub = ctx.args.toLowerCase()

      if (sub === 'list' || sub === 'status' || sub === '') {
        const entries = getMcpEntries()
        if (entries.length === 0) {
          return 'No MCP servers connected. Configure servers in ~/.claude-code-mini/mcp.json'
        }

        const lines = [`MCP Servers (${entries.length} connected):`, '']
        for (const entry of entries) {
          lines.push(`  ${entry.serverName} — ${entry.tools.length} tool(s)`)
          for (const tool of entry.tools) {
            lines.push(`    - ${tool.name}: ${tool.description.slice(0, 80)}`)
          }
        }
        return lines.join('\n')
      }

      if (sub === 'config') {
        const configPath = join(homedir(), '.claude-code-mini', 'mcp.json')
        if (!existsSync(configPath)) {
          return `No MCP config found at ${configPath}. Create one with "mcpServers" key.`
        }
        try {
          const raw = readFileSync(configPath, 'utf-8')
          const parsed = JSON.parse(raw)
          const servers = Object.keys(parsed.mcpServers || {})
          return `MCP config: ${configPath}\nConfigured servers: ${servers.length > 0 ? servers.join(', ') : 'none'}`
        } catch {
          return `MCP config exists at ${configPath} but could not be parsed.`
        }
      }

      return `Unknown subcommand: "${sub}". Use: list, status, config`
    },
  })
}
