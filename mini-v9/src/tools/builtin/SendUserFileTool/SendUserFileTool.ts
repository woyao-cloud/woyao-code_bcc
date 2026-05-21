import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { readFileSync, existsSync } from 'fs'
import { resolve, isAbsolute } from 'path'
import { getCwd } from '../../../bootstrap/state.js'

export const SendUserFileTool: Tool = {
  name: 'SendUserFile',
  description:
    'Send a file to the user for review. Reads and displays the file content. Use when you want the user to review code, config, or output.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to the file to send' },
      max_chars: {
        type: 'number',
        description: 'Max characters to show (default 5000)',
      },
    },
    required: ['file_path'],
  },
  prompt:
    'SendUserFile tool: send a file to the user for review. The file content will be displayed for the user to examine.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const fp = String(input.file_path ?? '').trim()
    if (!fp) {
      return {
        content: 'File path is required',
        success: false,
        error: 'Missing file_path',
      }
    }

    const fullPath = isAbsolute(fp) ? fp : resolve(ctx.cwd || getCwd(), fp)
    if (!existsSync(fullPath)) {
      return {
        content: `File not found: ${fp}`,
        success: false,
        error: 'Not found',
      }
    }

    try {
      const content = readFileSync(fullPath, 'utf-8')
      const maxChars = Number(input.max_chars ?? 5000)
      const truncated = content.length > maxChars
      const display = truncated
        ? content.slice(0, maxChars) + `\n... [truncated at ${maxChars} chars]`
        : content

      return {
        content: `--- ${fp} (${content.length} chars) ---\n${display}`,
        success: true,
        metadata: { filePath: fp, charCount: content.length, truncated },
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: `Error reading file: ${msg}`,
        success: false,
        error: msg,
      }
    }
  },

  userFacingName: () => 'SendUserFile',
}
