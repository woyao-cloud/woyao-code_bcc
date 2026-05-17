import { registerCommand, getHelpText } from './registry.js'

export function registerHelpCommand(): void {
  registerCommand({
    name: 'help',
    aliases: ['h'],
    description: 'Show this help',
    usage: '/help',
    handler: () => getHelpText() + '\n',
  })
}
