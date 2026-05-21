import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import { existsSync } from 'fs'
import { resolve, isAbsolute } from 'path'

let additionalDirs: string[] = []

export function getAdditionalDirectories(): string[] {
  return [...additionalDirs]
}

export function registerAddDirCommand(): void {
  registerCommand({
    name: 'add-dir',
    aliases: ['add_dir', 'adddir'],
    description: 'Add a directory to the allowed working directories list',
    usage: '/add-dir <path>',
    handler: (ctx: CommandContext) => {
      const dir = ctx.args.trim()
      if (!dir) {
        if (additionalDirs.length === 0) {
          return 'No additional directories configured.\nUsage: /add-dir <path>'
        }
        const lines = ['Additional directories:']
        for (let i = 0; i < additionalDirs.length; i++) {
          lines.push(`  ${i + 1}. ${additionalDirs[i]}`)
        }
        return lines.join('\n')
      }

      const resolvedPath = isAbsolute(dir) ? dir : resolve(ctx.cwd, dir)

      if (!existsSync(resolvedPath)) {
        return `Directory not found: ${resolvedPath}`
      }

      if (additionalDirs.includes(resolvedPath)) {
        return `Directory already added: ${resolvedPath}`
      }

      additionalDirs.push(resolvedPath)
      return `Added directory: ${resolvedPath}`
    },
  })
}
