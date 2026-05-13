import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { readdirSync, statSync, existsSync } from 'fs'
import { resolve, isAbsolute, join, relative } from 'path'
import { getCwd } from '../../../bootstrap/state.js'
export const GlobTool: Tool = {
  name: 'Glob',
  description:
    'Find files matching a glob pattern (e.g. src/**/*.ts). Returns matching file paths relative to the working directory.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g. src/**/*.ts)',
      },
      path: { type: 'string', description: 'Base directory' },
    },
    required: ['pattern'],
  },
  prompt: 'Glob tool: find files by glob pattern.',
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '')
    const basePath = String(input.path || ctx.cwd || getCwd())
    const fullPath = isAbsolute(basePath)
      ? basePath
      : resolve(ctx.cwd || getCwd(), basePath)
    try {
      const regex = globToRegex(pattern)
      const files = findFiles(fullPath, regex)
      const relativeFiles = files.map(f => relative(fullPath, f)).slice(0, 100)
      return {
        content: `Found ${files.length} files matching '${pattern}':\n${relativeFiles.join('\n')}`,
        success: true,
      }
    } catch (e) {
      return { content: `Glob error: ${e}`, success: false, error: String(e) }
    }
  },
  userFacingName: () => 'Glob',
}
function globToRegex(pattern: string): RegExp {
  const parts = pattern.split('**')
  const regex = parts
    .map(
      (p, i) =>
        (i > 0 ? '(.*)' : '') +
        p
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '.'),
    )
    .join('')
  return new RegExp('^' + regex + '$')
}
function findFiles(dir: string, regex: RegExp): string[] {
  const results: string[] = []
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return results
    const items = readdirSync(dir)
    for (const item of items) {
      if (item.startsWith('.') || item === 'node_modules') continue
      const fp = join(dir, item)
      try {
        const st = statSync(fp)
        if (st.isDirectory()) results.push(...findFiles(fp, regex))
        else if (regex.test(item)) results.push(fp)
      } catch {}
    }
  } catch {}
  return results
}
