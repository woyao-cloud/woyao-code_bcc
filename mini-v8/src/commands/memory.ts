import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import {
  handleMemoryCommand,
  handleSessionMemoryCommand,
  handleMemoryStoresCommand,
  handleTeamMemoryCommand,
} from './memoryCommands.js'

export function registerMemoryCommands(): void {
  registerCommand({
    name: 'memory',
    description: 'Memory management',
    usage: '/memory <extract|search>',
    handler: async (ctx: CommandContext) => {
      const result = await handleMemoryCommand(ctx.args, ctx.messages)
      return result
    },
  })

  registerCommand({
    name: 'session-memory',
    description: 'Session memory management',
    usage: '/session-memory <extract|search|notes>',
    handler: (ctx: CommandContext) => {
      return handleSessionMemoryCommand(ctx.args)
    },
  })

  registerCommand({
    name: 'memory-stores',
    description: 'List memory stores',
    usage: '/memory-stores',
    handler: (ctx: CommandContext) => {
      return handleMemoryStoresCommand(ctx.args)
    },
  })

  registerCommand({
    name: 'sync-memory',
    description: 'Team memory sync',
    usage: '/sync-memory <pull|push>',
    handler: async (ctx: CommandContext) => {
      const result = await handleTeamMemoryCommand(ctx.args)
      return result
    },
  })
}
