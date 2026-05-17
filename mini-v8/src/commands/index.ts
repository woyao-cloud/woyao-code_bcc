export {
  registerCommand,
  unregisterCommand,
  getCommand,
  getAllCommands,
  clearCommands,
  getHelpText,
  dispatchCommand,
} from './registry.js'
export type { CommandContext, CommandHandler } from './registry.js'

import type { ConversationBuffers } from '../services/messages/apiProjection.js'
import type { LoadedPlugin } from '../plugins/index.js'
import type { MCPEntry } from '../services/mcp/mcpClient.js'
import { registerHelpCommand } from './help.js'
import { registerExitCommand } from './exit.js'
import { registerClearCommand } from './clear.js'
import { registerModelCommand } from './model.js'
import { registerCompactCommand } from './compact.js'
import { registerPluginCommand } from './plugin.js'
import { registerSkillCommand } from './skill.js'
import { registerMemoryCommands } from './memory.js'
import { registerAgentCommands } from './agent.js'
import { registerMcpCommand } from './mcp.js'
import { registerDoctorCommand } from './doctor.js'
import { registerPermissionsCommand } from './permissions.js'

export function initializeCommands(
  persistSnapshot: (conv: ConversationBuffers) => void,
  getConfig: () => { maxTurns?: number },
  getLoadedPlugins: () => LoadedPlugin[],
  getMcpEntries: () => MCPEntry[],
): void {
  registerHelpCommand()
  registerExitCommand()
  registerClearCommand(persistSnapshot)
  registerModelCommand()
  registerCompactCommand(getConfig)
  registerPluginCommand(getLoadedPlugins)
  registerSkillCommand()
  registerMemoryCommands()
  registerAgentCommands(getLoadedPlugins)
  registerMcpCommand(getMcpEntries)
  registerDoctorCommand(getMcpEntries)
  registerPermissionsCommand()
}
