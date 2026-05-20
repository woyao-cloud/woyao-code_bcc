import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import { serializeConversationBuffers } from '../services/messages/apiProjection.js'
import { getSessionId } from '../services/memory/sessionMemory.js'

export function registerExportCommand(): void {
  registerCommand({
    name: 'export',
    description: 'Export conversation as JSON',
    usage: '/export',
    handler: (ctx: CommandContext) => {
      const sid = getSessionId() ?? 'unknown'
      const count = ctx.messages.length
      const summary = ctx.messages.map(m => ({
        role: m.role,
        preview:
          typeof m.content === 'string'
            ? m.content.slice(0, 100)
            : `[${(m.content as Array<unknown>).length} blocks]`,
      }))
      return `Session: ${sid}\nMessages: ${count}\n\n${JSON.stringify(summary, null, 2)}`
    },
  })
}
