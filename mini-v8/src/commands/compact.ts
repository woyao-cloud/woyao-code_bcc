import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import {
  projectMessagesForAPI,
  requestForcedCompaction,
} from '../services/messages/apiProjection.js'
import { resolveModel } from '../utils/model/model.js'

export function registerCompactCommand(
  getConfig: () => { maxTurns?: number },
): void {
  registerCommand({
    name: 'compact',
    description: 'Compact conversation context to save tokens',
    usage: '/compact',
    handler: (ctx: CommandContext) => {
      const activeModel = resolveModel()
      const { didMicrocompact, didBudgetToolResults, didCompact } =
        projectMessagesForAPI(ctx.conversation, {
          model: activeModel,
          forceCompact: true,
          commitCompactionToConversation: true,
        })

      if (didCompact) {
        requestForcedCompaction(ctx.conversation)
        return 'Next API turn will use a compacted projection.'
      }
      if (didBudgetToolResults) {
        return 'Next API turn will use budgeted tool result previews.'
      }
      if (didMicrocompact) {
        return 'Next API turn will use microcompacted tool results.'
      }
      return `No compaction needed (${ctx.conversation.fullMessages.length} full messages).`
    },
  })
}
