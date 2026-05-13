import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, isAbsolute } from 'path'
import { getCwd } from '../../../bootstrap/state.js'
export const FileEditTool: Tool = {
  name: 'Edit',
  description:
    'Edit a file by replacing old_string with new_string. The old_string must exactly match the content in the file including whitespace, indentation, and line endings.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to the file' },
      old_string: { type: 'string', description: 'Exact text to replace' },
      new_string: { type: 'string', description: 'Replacement text' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  prompt: 'FileEdit tool: precise search-and-replace editing.',
  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const fp = String(input.file_path ?? '')
    const oldStr = String(input.old_string ?? '')
    const newStr = String(input.new_string ?? '')
    const replaceAll = Boolean(input.replace_all)
    const fullPath = isAbsolute(fp) ? fp : resolve(ctx.cwd || getCwd(), fp)
    if (!existsSync(fullPath))
      return {
        content: `File not found: ${fp}`,
        success: false,
        error: 'not_found',
      }
    try {
      const original = readFileSync(fullPath, 'utf-8')
      if (!original.includes(oldStr))
        return {
          content: `old_string not found in ${fp}`,
          success: false,
          error: 'string_not_found',
        }
      const count = (
        original.match(
          new RegExp(oldStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        ) || []
      ).length
      if (count > 1 && !replaceAll)
        return {
          content: `${count} matches of old_string found. Set replace_all: true to replace all, or make old_string more specific.`,
          success: false,
          error: 'multiple_matches',
        }
      const edited = replaceAll
        ? original.split(oldStr).join(newStr)
        : original.replace(oldStr, newStr)
      writeFileSync(fullPath, edited, 'utf-8')
      return {
        content: `Edited ${fp}: replaced ${replaceAll ? count : 1} occurrence(s)`,
        success: true,
      }
    } catch (e) {
      return { content: `Edit error: ${e}`, success: false, error: String(e) }
    }
  },
  userFacingName: () => 'Edit',
}
