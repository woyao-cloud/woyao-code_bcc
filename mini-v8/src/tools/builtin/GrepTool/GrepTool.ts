import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { readFileSync, existsSync } from 'fs'
import { resolve, isAbsolute, join, relative } from 'path'
import { readdirSync, statSync } from 'fs'
import { getCwd } from '../../../bootstrap/state.js'
export const GrepTool: Tool = {
  name: 'Grep',
  description:
    'Search for a pattern in files. Uses regex patterns. Returns matching lines with file path, line number, and line content.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'Directory or file path' },
      include: {
        type: 'string',
        description: 'File glob to include (e.g. *.ts)',
      },
    },
    required: ['pattern'],
  },
  prompt: 'Grep tool: regex search across files.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const pattern = String(input.pattern ?? '')
    const basePath = String(input.path || ctx.cwd || getCwd())
    const include = String(input.include || '*')
    const fullPath = isAbsolute(basePath)
      ? basePath
      : resolve(ctx.cwd || getCwd(), basePath)
    try {
      const regex = new RegExp(pattern, 'g')
      const files = collectFiles(fullPath, include)
      const results: string[] = []
      let totalMatches = 0
      for (const f of files.slice(0, 50)) {
        const content = readFileSync(f, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (regex.test(line)) {
            regex.lastIndex = 0
            results.push(
              `${relative(fullPath, f)}:${i + 1}: ${line.trim().slice(0, 200)}`,
            )
            totalMatches++
          }
        }
      }
      return {
        content:
          results.length > 0
            ? `Found ${totalMatches} matches in ${files.length} files:\n${results.join('\n')}`
            : 'No matches found',
        success: true,
      }
    } catch (e) {
      return { content: `Grep error: ${e}`, success: false, error: String(e) }
    }
  },
  userFacingName: () => 'Grep',
}
function collectFiles(dir: string, pattern: string): string[] {
  if (existsSync(dir) && statSync(dir).isFile()) return [dir]
  const results: string[] = []
  try {
    const items = readdirSync(dir)
    for (const item of items) {
      const fp = join(dir, item)
      const st = statSync(fp)
      if (st.isDirectory() && !item.startsWith('.') && item !== 'node_modules')
        results.push(...collectFiles(fp, pattern))
      else if (st.isFile() && matchGlob(item, pattern)) results.push(fp)
    }
  } catch {}
  return results
}
function matchGlob(name: string, pattern: string): boolean {
  if (pattern === '*') return true
  return new RegExp(
    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    'i',
  ).test(name)
}
