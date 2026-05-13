import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, isAbsolute, dirname } from 'path'
import { getCwd } from '../../../bootstrap/state.js'

export const ApplyPatchTool: Tool = {
  name: 'ApplyPatch',
  description:
    'Apply precise edits to files using unified diff format. ' +
    'Format: *** Begin Patch\n*** Update File: path/to/file\n@@ ... @@\n- old line\n+ new line\n*** End Patch\n' +
    'Each hunk shows context lines, lines to remove (prefixed with -), and lines to add (prefixed with +).',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to file to patch' },
      patch: { type: 'string', description: 'Unified diff patch content' },
    },
    required: ['file_path', 'patch'],
  },
  prompt:
    'ApplyPatch tool: apply unified diff patches to files for precise edits.',

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const fp = String(input.file_path ?? '')
    const patch = String(input.patch ?? '')

    if (!fp.trim() || !patch.trim()) {
      return {
        content: 'file_path and patch are required',
        success: false,
        error: 'Missing parameters',
      }
    }

    const fullPath = isAbsolute(fp) ? fp : resolve(ctx.cwd || getCwd(), fp)

    if (!existsSync(fullPath)) {
      return {
        content: `File not found: ${fp}`,
        success: false,
        error: 'not_found',
      }
    }

    try {
      const original = readFileSync(fullPath, 'utf-8')
      const result = applyPatch(original, patch)

      if (!result.success) {
        return result
      }

      writeFileSync(fullPath, result.content, 'utf-8')

      const changes = countChanges(original, result.content)
      return {
        content: `Patched ${fp}: ${changes.added} lines added, ${changes.removed} lines removed`,
        success: true,
        metadata: changes,
      }
    } catch (e) {
      return { content: `Patch error: ${e}`, success: false, error: String(e) }
    }
  },

  userFacingName: () => 'ApplyPatch',
}

interface PatchResult {
  success: boolean
  content: string
  error?: string
}

function applyPatch(original: string, patchStr: string): PatchResult {
  const hunks = parsePatch(patchStr)
  if (hunks.length === 0) {
    return {
      success: false,
      content: '',
      error: 'No valid hunks found in patch',
    }
  }

  let result = original
  const originalLines = original.split('\n')

  for (const hunk of hunks) {
    const applied = applyHunk(originalLines, hunk)
    if (!applied.success) {
      return applied
    }
    result = applied.content
  }

  return { success: true, content: result }
}

interface Hunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: Array<{ type: 'context' | 'remove' | 'add'; text: string }>
}

function parsePatch(patchStr: string): Hunk[] {
  const hunks: Hunk[] = []
  const lines = patchStr.split('\n')
  let currentHunk: Hunk | null = null

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/)
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]),
        oldCount: parseInt(hunkMatch[2] || '1'),
        newStart: parseInt(hunkMatch[3]),
        newCount: parseInt(hunkMatch[4] || '1'),
        lines: [],
      }
    } else if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({ type: 'add', text: line.slice(1) })
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({ type: 'remove', text: line.slice(1) })
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ type: 'context', text: line.slice(1) })
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk)
  return hunks
}

function applyHunk(lines: string[], hunk: Hunk): PatchResult {
  const result: string[] = []
  let lineIdx = 0
  let hunkIdx = 0

  // Copy lines before hunk
  while (lineIdx < hunk.oldStart - 1 && lineIdx < lines.length) {
    result.push(lines[lineIdx])
    lineIdx++
  }

  // Apply hunk
  while (hunkIdx < hunk.lines.length) {
    const hunkLine = hunk.lines[hunkIdx]

    if (hunkLine.type === 'context') {
      if (lineIdx < lines.length) {
        if (lines[lineIdx] !== hunkLine.text) {
          return {
            success: false,
            content: '',
            error: `Context mismatch at line ${lineIdx + 1}: expected "${hunkLine.text}", got "${lines[lineIdx]}"`,
          }
        }
        result.push(lines[lineIdx])
        lineIdx++
      } else {
        result.push(hunkLine.text)
      }
      hunkIdx++
    } else if (hunkLine.type === 'remove') {
      if (lineIdx < lines.length && lines[lineIdx] !== hunkLine.text) {
        return {
          success: false,
          content: '',
          error: `Remove mismatch at line ${lineIdx + 1}: expected "${hunkLine.text}", got "${lines[lineIdx]}"`,
        }
      }
      lineIdx++
      hunkIdx++
    } else if (hunkLine.type === 'add') {
      result.push(hunkLine.text)
      hunkIdx++
    }
  }

  // Copy remaining lines
  while (lineIdx < lines.length) {
    result.push(lines[lineIdx])
    lineIdx++
  }

  return { success: true, content: result.join('\n') }
}

function countChanges(
  original: string,
  edited: string,
): { added: number; removed: number } {
  const oldLines = original.split('\n')
  const newLines = edited.split('\n')
  return {
    added: Math.max(0, newLines.length - oldLines.length),
    removed: Math.max(0, oldLines.length - newLines.length),
  }
}
