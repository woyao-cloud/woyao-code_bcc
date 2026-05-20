import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import { getSessionId } from '../services/memory/sessionMemory.js'

export function registerSessionCommand(): void {
  registerCommand({
    name: 'session',
    description: 'Show session information',
    usage: '/session',
    handler: () => {
      const sid = getSessionId()
      return sid ? `Session ID: ${sid}` : 'No active session.'
    },
  })
}
