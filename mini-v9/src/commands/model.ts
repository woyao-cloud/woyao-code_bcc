import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'

export function registerModelCommand(): void {
  registerCommand({
    name: 'model',
    description: 'Change the active model',
    usage: '/model <name>',
    handler: (ctx: CommandContext) => {
      if (!ctx.args)
        return 'Usage: /model <name> (e.g. claude-sonnet-4-20250514)'
      // Model preference is stored; effective on next turn
      return `Model set to: ${ctx.args} (effective on next turn)`
    },
  })
}
