import { registerCommand } from './registry.js'
import type { CommandContext } from './registry.js'
import {
  createSnipBoundaryMessage,
  snipBoundaryToMessageParam,
  snipCompactIfNeeded,
  shouldNudgeForSnips,
} from '../services/compact/snipCompact.js'
import { toSnipEntries, applySnipToBuffers } from '../services/messages/apiProjection.js'

export function registerForceSnipCommand(): void {
  registerCommand({
    name: 'force-snip',
    aliases: ['snip'],
    description: 'Snip old conversation history to free context window space',
    usage: '/force-snip',
    handler: (ctx: CommandContext) => {
      const buffers = ctx.conversation
      if (buffers.fullMessages.length === 0) {
        return 'No messages to snip.'
      }

      // Check if there's already a snip boundary (don't create another if nothing new)
      const entries = toSnipEntries(buffers)

      // Collect all current message UUIDs
      const allUuids = entries
        .filter(e => {
          const m = e.msg as unknown as Record<string, unknown>
          return m.subtype !== 'snip_boundary'
        })
        .map(e => e.uuid)

      if (allUuids.length === 0) {
        return 'No snipable messages found.'
      }

      // Create and push the snip boundary
      const boundary = createSnipBoundaryMessage(allUuids)
      const boundaryParam = snipBoundaryToMessageParam(boundary)
      buffers.fullMessages.push(boundaryParam)
      buffers.messageUuids.push(boundary.uuid)

      // Execute the snip immediately
      const result = snipCompactIfNeeded([
        ...entries,
        { msg: boundaryParam, uuid: boundary.uuid },
      ])

      if (result.executed && result.entries.length < entries.length + 1) {
        applySnipToBuffers(buffers, result.entries)
        const nudge = shouldNudgeForSnips(result.entries.length)
          ? `\n${SNIP_NUDGE_TEXT}`
          : ''
        return `Snipped ${allUuids.length} messages, freed ~${result.tokensFreed} tokens.${nudge}`
      }

      return `Boundary created. ${allUuids.length} messages will be snipped on next API request.`
    },
  })
}

// Import for the nudge text
import { SNIP_NUDGE_TEXT } from '../services/compact/snipCompact.js'
