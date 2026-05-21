import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'

export function registerVersionCommand(): void {
  registerCommand({
    name: 'version',
    aliases: ['v'],
    description: 'Show version information',
    usage: '/version',
    handler: () => 'Claude Code Mini v8.0.0',
  })
}
