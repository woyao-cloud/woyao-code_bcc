import type { ConversationBuffers } from '../services/messages/apiProjection.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

export interface CommandContext {
  args: string
  conversation: ConversationBuffers
  messages: BetaMessageParam[]
  cwd: string
}

export interface CommandHandler {
  name: string
  aliases?: string[]
  description: string
  usage?: string
  handler: (ctx: CommandContext) => Promise<string | null> | string | null
}

let commands = new Map<string, CommandHandler>()

export function registerCommand(command: CommandHandler): void {
  commands.set(command.name, command)
  if (command.aliases) {
    for (const alias of command.aliases) {
      commands.set(alias, command)
    }
  }
}

export function unregisterCommand(name: string): void {
  const cmd = commands.get(name)
  if (cmd) {
    commands.delete(name)
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        commands.delete(alias)
      }
    }
  }
}

export function getCommand(name: string): CommandHandler | undefined {
  return commands.get(name)
}

export function getAllCommands(): CommandHandler[] {
  const seen = new Set<string>()
  const result: CommandHandler[] = []
  for (const cmd of commands.values()) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name)
      result.push(cmd)
    }
  }
  return result
}

export function clearCommands(): void {
  commands.clear()
}

export function getHelpText(): string {
  const lines = ['Commands:']
  const seen = new Set<string>()
  const sorted = Array.from(commands.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  for (const cmd of sorted) {
    if (seen.has(cmd.name)) continue
    seen.add(cmd.name)
    const names = [cmd.name, ...(cmd.aliases ?? [])]
      .map(n => `/${n}`)
      .join(', ')
    lines.push(`  ${names.padEnd(25)} ${cmd.description}`)
  }

  return lines.join('\n')
}

export async function dispatchCommand(
  line: string,
  ctx: CommandContext,
): Promise<string | null> {
  const trimmed = line.trim()
  if (!trimmed.startsWith('/')) return null

  const [rawName, ...rest] = trimmed.slice(1).split(/\s+/)
  const cmdName = rawName.toLowerCase()
  const cmd = getCommand(cmdName)
  if (!cmd) return null

  const subCtx: CommandContext = {
    ...ctx,
    args: rest.join(' '),
  }

  return cmd.handler(subCtx)
}
