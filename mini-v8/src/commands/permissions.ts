import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import {
  loadPermissionMode,
  loadPermissionRules,
  addPermissionRule,
  removePermissionRule,
  clearPermissionRules,
  savePermissionMode,
} from '../services/permission/permissionsLoader.js'

export function registerPermissionsCommand(): void {
  registerCommand({
    name: 'permissions',
    aliases: ['perm'],
    description: 'Manage permission rules: list, add, remove, mode',
    usage: '/permissions <list|add|remove|clear|mode> [args]',
    handler: (ctx: CommandContext) => {
      const parts = ctx.args.split(/\s+/)
      const sub = parts[0]?.toLowerCase() || 'list'

      switch (sub) {
        case 'list':
        case 'status': {
          const mode = loadPermissionMode()
          const rules = loadPermissionRules()
          const lines = [`Permission mode: ${mode}`]
          if (rules.length === 0) {
            lines.push('No custom rules defined.')
          } else {
            lines.push(`Rules (${rules.length}):`)
            for (let i = 0; i < rules.length; i++) {
              const r = rules[i]
              lines.push(
                `  ${i}. ${r.behavior}: ${r.toolName}(${r.pattern}) [${r.source}]`,
              )
            }
          }
          return lines.join('\n')
        }

        case 'add': {
          const ruleStr = parts.slice(1).join(' ')
          if (!ruleStr) {
            return 'Usage: /permissions add <behavior>: <ToolName>(<pattern>)\nExample: /permissions add deny: Bash(rm *)'
          }
          const ok = addPermissionRule(ruleStr)
          return ok
            ? `Rule added: ${ruleStr}`
            : `Failed to add rule. Use format: allow|deny|ask: ToolName(pattern)`
        }

        case 'remove':
        case 'rm': {
          const index = parseInt(parts[1], 10)
          if (isNaN(index)) {
            return 'Usage: /permissions remove <index>\nUse /permissions list to see indices.'
          }
          const ok = removePermissionRule(index)
          return ok ? `Rule #${index} removed.` : `Rule #${index} not found.`
        }

        case 'clear': {
          clearPermissionRules()
          return 'All permission rules cleared.'
        }

        case 'mode': {
          const mode = parts[1]?.toLowerCase()
          const validModes = [
            'default',
            'acceptEdits',
            'bypassPermissions',
            'dontAsk',
            'plan',
          ]
          if (!mode || !validModes.includes(mode)) {
            return `Usage: /permissions mode <${validModes.join('|')}>\nCurrent mode: ${loadPermissionMode()}`
          }
          savePermissionMode(mode as any)
          return `Permission mode set to: ${mode}`
        }

        default:
          return `Unknown subcommand: "${sub}". Use list, add, remove, clear, mode`
      }
    },
  })
}
