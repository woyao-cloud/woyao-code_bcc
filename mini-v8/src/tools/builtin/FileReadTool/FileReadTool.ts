import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { readFileSync, existsSync } from 'fs'
import { resolve, isAbsolute } from 'path'
import { getCwd } from '../../../bootstrap/state.js'
export const FileReadTool: Tool = {
  name: 'Read',
  description:
    'Read the contents of a file. Use to inspect file contents before editing.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to the file' },
      offset: { type: 'number', description: 'Line offset' },
      limit: { type: 'number', description: 'Max lines' },
    },
    required: ['file_path'],
  },
  prompt: 'FileRead tool: read file contents with optional offset/limit.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const fp = String(input.file_path ?? '')
    const fullPath = isAbsolute(fp) ? fp : resolve(ctx.cwd || getCwd(), fp)
    if (!existsSync(fullPath))
      return {
        content: `File not found: ${fp}`,
        success: false,
        error: 'not_found',
      }
    try {
      const content = readFileSync(fullPath, 'utf-8')
      const lines = content.split('\n')
      const offset = Math.max(0, Number(input.offset) || 0)
      const limit = Number(input.limit) || lines.length
      const slice = lines.slice(offset, offset + limit)
      const numbered = slice.map((l, i) => `${offset + i + 1}\t${l}`).join('\n')
      return {
        content: `${fullPath} (${lines.length} lines)\n${numbered}`,
        rendered: slice.join('\n'),
        success: true,
      }
    } catch (e) {
      return { content: `Read error: ${e}`, success: false, error: String(e) }
    }
  },
  userFacingName: () => 'Read',
}
