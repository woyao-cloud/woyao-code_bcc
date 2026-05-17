import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import { getAPIKey, hasAPIKey } from '../utils/auth.js'
import { getAPIProvider } from '../utils/model/providers.js'
import { getCwd } from '../bootstrap/state.js'
import { resolveModel } from '../utils/model/model.js'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export function registerDoctorCommand(
  getMcpEntries: () => Array<{
    serverName: string
    tools: Array<{ name: string }>
  }>,
): void {
  registerCommand({
    name: 'doctor',
    description: 'Run system diagnostics',
    usage: '/doctor',
    handler: () => {
      const checks: string[] = []
      let allOk = true

      const add = (ok: boolean, label: string, detail: string) => {
        checks.push(`  ${ok ? '✓' : '✗'} ${label}: ${detail}`)
        if (!ok) allOk = false
      }

      // 1. API Key
      const hasKey = hasAPIKey()
      add(hasKey, 'API Key', hasKey ? 'configured' : 'MISSING')

      // 2. Provider
      const provider = getAPIProvider()
      add(true, 'Provider', provider)

      // 3. Model
      try {
        const model = resolveModel()
        add(true, 'Model', model)
      } catch {
        add(false, 'Model', 'could not resolve')
      }

      // 4. Working directory
      const cwd = getCwd()
      const cwdOk = existsSync(cwd)
      add(cwdOk, 'Working Directory', cwdOk ? cwd : `NOT FOUND: ${cwd}`)

      // 5. Config
      const configPath = join(homedir(), '.claude-code-mini', 'config.json')
      add(
        existsSync(configPath),
        'Config',
        existsSync(configPath) ? 'found' : 'not found (using defaults)',
      )

      // 6. MCP Servers
      const mcpEntries = getMcpEntries()
      const totalMcpTools = mcpEntries.reduce((s, e) => s + e.tools.length, 0)
      add(
        mcpEntries.length > 0,
        'MCP Servers',
        `${mcpEntries.length} server(s), ${totalMcpTools} tool(s)`,
      )

      // 7. Platform
      add(true, 'Platform', `${process.platform} ${process.arch}`)

      // 8. Runtime
      add(true, 'Runtime', `Node ${process.version}`)

      const header = allOk
        ? '=== System Health: ALL OK ==='
        : '=== System Health: ISSUES FOUND ==='

      return `${header}\n${checks.join('\n')}`
    },
  })
}
