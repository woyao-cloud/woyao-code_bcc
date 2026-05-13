import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, isAbsolute, dirname } from 'path'
import { getCwd } from '../../../bootstrap/state.js'
export const FileWriteTool: Tool = {
  name: 'Write',
  description:
    'Write content to a file, creating it if it does not exist or overwriting if it does.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to the file' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['file_path', 'content'],
  },
  prompt: 'FileWrite tool: write content to a file.',
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const fp = String(input.file_path ?? '')
    const content = String(input.content ?? '')
    const fullPath = isAbsolute(fp) ? fp : resolve(ctx.cwd || getCwd(), fp)
    try {
      mkdirSync(dirname(fullPath), { recursive: true })
      const existed = existsSync(fullPath)
      writeFileSync(fullPath, content, 'utf-8')
      const lines = content.split('\n').filter(l => l.length > 0).length
      return {
        content: `${existed ? 'Updated' : 'Created'}: ${fullPath} (${lines} lines, ${content.length} chars)`,
        success: true,
      }
    } catch (e) {
      return { content: `Write error: ${e}`, success: false, error: String(e) }
    }
  },
  userFacingName: () => 'Write',
}
