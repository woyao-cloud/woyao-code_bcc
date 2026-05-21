import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'

export function registerForkCommand(): void {
  registerCommand({
    name: 'fork',
    description: 'Fork conversation at current point',
    usage: '/fork',
    handler: (ctx: CommandContext) => {
      const count = ctx.messages.length
      return `Fork point set at message ${count}. (Full fork not implemented in mini mode — use session snapshot.)`
    },
  })
}
