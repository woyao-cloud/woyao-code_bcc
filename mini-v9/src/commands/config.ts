import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import { loadConfig, updateConfig } from '../services/config/configManager.js'

export function registerConfigCommand(): void {
  registerCommand({
    name: 'config',
    description: 'View or change configuration',
    usage: '/config list | /config <key> <value>',
    handler: (ctx: CommandContext) => {
      const args = ctx.args.trim()
      if (!args || args === 'list') {
        const config = loadConfig()
        const lines = ['Current config:']
        for (const [k, v] of Object.entries(config)) {
          lines.push(`  ${k} = ${v}`)
        }
        if (Object.keys(config).length === 0) lines.push('  (defaults)')
        return lines.join('\n')
      }

      const eqIdx = args.indexOf('=')
      let key: string, value: string
      if (eqIdx >= 0) {
        key = args.slice(0, eqIdx).trim()
        value = args.slice(eqIdx + 1).trim()
      } else {
        const parts = args.split(/\s+/)
        key = parts[0]
        value = parts.slice(1).join(' ') || 'true'
      }

      const validKeys = [
        'model',
        'maxTurns',
        'permissionMode',
        'theme',
        'autoCompact',
      ]
      if (!validKeys.includes(key)) {
        return `Unknown key: "${key}". Valid: ${validKeys.join(', ')}`
      }

      const parsed: Record<string, unknown> = {
        [key]: key === 'maxTurns' ? Number(value) : value,
      }
      updateConfig(parsed as any)
      return `Config updated: ${key} = ${value}`
    },
  })
}
