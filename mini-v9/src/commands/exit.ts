import { registerCommand } from './registry.js'

export function registerExitCommand(): void {
  registerCommand({
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit the program',
    usage: '/exit',
    handler: () => '__EXIT__',
  })
}
