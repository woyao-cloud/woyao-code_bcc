import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import { clearConversationBuffers } from '../services/messages/apiProjection.js'

export function registerClearCommand(
  persistSnapshot: (conv: CommandContext['conversation']) => void,
): void {
  registerCommand({
    name: 'clear',
    description: 'Clear conversation history',
    usage: '/clear',
    handler: (ctx: CommandContext) => {
      clearConversationBuffers(ctx.conversation)
      persistSnapshot(ctx.conversation)
      return 'Conversation cleared.'
    },
  })
}
