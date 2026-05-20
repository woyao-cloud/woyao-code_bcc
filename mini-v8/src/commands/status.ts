import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'

export function registerStatusCommand(
  getEngine: () => Record<string, unknown>,
): void {
  registerCommand({
    name: 'status',
    description: 'Show current session status',
    usage: '/status',
    handler: (ctx: CommandContext) => {
      const ref = getEngine()
      const msgCount = ctx.messages.length
      const lines = [
        `Messages: ${msgCount}`,
        `Turns: ${(ref.engine as any)?.turnCount ?? 0}`,
        `Tokens in: ${(ref.engine as any)?.totalInputTokens ?? 0}`,
        `Tokens out: ${(ref.engine as any)?.totalOutputTokens ?? 0}`,
        `Platform: ${process.platform} ${process.arch}`,
        `CWD: ${ctx.cwd}`,
      ]
      return lines.join('\n')
    },
  })
}
