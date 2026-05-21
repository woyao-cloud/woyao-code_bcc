import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import type { LoadedPlugin } from '../plugins/index.js'
import { handlePluginCommand } from './pluginCommands.js'

export function registerPluginCommand(
  getLoadedPlugins: () => LoadedPlugin[],
): void {
  registerCommand({
    name: 'plugin',
    description: 'Plugin management',
    usage: '/plugin <command> [args]',
    handler: async (ctx: CommandContext) => {
      const result = await handlePluginCommand(
        `/${ctx.args}`,
        getLoadedPlugins,
        ctx.cwd,
      )
      return result
    },
  })
}
