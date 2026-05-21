import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'

export function registerHistoryCommand(): void {
  registerCommand({
    name: 'history',
    description: 'Show conversation message history summary',
    usage: '/history [count]',
    handler: (ctx: CommandContext) => {
      const count = Math.min(parseInt(ctx.args) || 10, ctx.messages.length)
      const recent = ctx.messages.slice(-count)
      const lines = [`Last ${recent.length} messages:`]
      for (const msg of recent) {
        const role = msg.role === 'user' ? '>' : '·'
        const preview =
          typeof msg.content === 'string'
            ? msg.content.slice(0, 80).replace(/\n/g, ' ')
            : `[${(msg.content as Array<unknown>).length} block(s)]`
        lines.push(`  ${role} ${preview}`)
      }
      return lines.join('\n')
    },
  })
}
