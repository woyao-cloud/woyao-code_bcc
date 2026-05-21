import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import {
  handleAgentCommand,
  handleTeamCommand,
  handleSwarmCommand,
} from './agentCommands.js'
import type { LoadedPlugin } from '../plugins/index.js'

export function registerAgentCommands(
  getLoadedPlugins: () => LoadedPlugin[],
): void {
  registerCommand({
    name: 'agent',
    description: 'Agent management',
    usage: '/agent <list|add|remove> [name]',
    handler: async (ctx: CommandContext) => {
      const result = await handleAgentCommand(
        ctx.args,
        ctx.cwd,
        getLoadedPlugins(),
      )
      return result
    },
  })

  registerCommand({
    name: 'team',
    description: 'Team management',
    usage: '/team <create|delete|list|members>',
    handler: (ctx: CommandContext) => {
      return handleTeamCommand(ctx.args)
    },
  })

  registerCommand({
    name: 'swarm',
    description: 'Swarm coordination',
    usage: '/swarm <start|stop|status>',
    handler: async (ctx: CommandContext) => {
      const result = await handleSwarmCommand(ctx.args)
      return result
    },
  })
}
