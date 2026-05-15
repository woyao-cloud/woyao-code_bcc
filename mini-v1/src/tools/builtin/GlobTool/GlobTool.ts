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
      const files = findFiles(fullPath, fullPath, regex)
      const relativeFiles = files
        .map(f => relative(fullPath, f).replace(/\\/g, '/'))
        .slice(0, 100)
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
  let regex = ''
  let i = 0
  while (i < pattern.length) {
    if (pattern[i] === '*' && pattern[i + 1] === '*') {
      // ** matches zero or more path segments, including slashes
      // If followed by '/', include it in the match
      if (pattern[i + 2] === '/') {
        regex += '([^/\\\\]*(?:/[^/\\\\]*)*/)?'
        i += 3 // skip '**/'
      } else {
        regex += '([^/\\\\]*(?:/[^/\\\\]*)*)'
        i += 2 // skip '**'
      }
    } else if (pattern[i] === '*') {
      regex += '[^/\\\\]*'
      i++
    } else if (pattern[i] === '?') {
      regex += '[^/\\\\]'
      i++
    } else {
      const ch = pattern[i]
      if ('.+^${}()|[\\]'.includes(ch)) {
        regex += '\\' + ch
      } else {
        regex += ch
      }
      i++
    }
  }
  return new RegExp('^' + regex + '$')
}

function findFiles(baseDir: string, dir: string, regex: RegExp): string[] {
  const results: string[] = []
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return results
    const items = readdirSync(dir)
    for (const item of items) {
      if (item.startsWith('.') || item === 'node_modules') continue
      const fp = join(dir, item)
      try {
        const st = statSync(fp)
        if (st.isDirectory()) {
          results.push(...findFiles(baseDir, fp, regex))
        } else {
          const relPath = relative(baseDir, fp).replace(/\\/g, '/')
          if (regex.test(relPath)) results.push(fp)
        }
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // skip unreadable directories
  }
  return results
}
