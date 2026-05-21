import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, isAbsolute } from 'path'
import { getCwd } from '../../../bootstrap/state.js'

interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw'
  source: string | string[]
  metadata?: Record<string, unknown>
  outputs?: Array<Record<string, unknown>>
  execution_count?: number | null
}

interface Notebook {
  nbformat: number
  nbformat_minor: number
  cells: NotebookCell[]
  metadata?: Record<string, unknown>
}

export const NotebookEditTool: Tool = {
  name: 'NotebookEdit',
  description:
    'Edit Jupyter notebook (.ipynb) files. Supports adding, updating, and deleting cells. Use for programmatic notebook editing.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Path to the .ipynb file' },
      action: {
        type: 'string',
        enum: ['add_cell', 'edit_cell', 'delete_cell', 'list_cells'],
        description: 'Action to perform on the notebook',
      },
      cell_index: {
        type: 'number',
        description:
          'Cell index (0-based). For add: position to insert. For edit/delete: which cell.',
      },
      cell_type: {
        type: 'string',
        enum: ['code', 'markdown', 'raw'],
        description: 'Cell type (for add_cell action)',
      },
      source: {
        type: 'string',
        description: 'Cell source content (for add_cell and edit_cell)',
      },
    },
    required: ['file_path', 'action'],
  },
  prompt:
    'NotebookEdit tool: edit Jupyter notebook cells. Use "list_cells" to view, "add_cell" to insert, "edit_cell" to update, "delete_cell" to remove.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => true,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const fp = String(input.file_path ?? '').trim()
    const action = String(input.action ?? '').trim()
    const fullPath = isAbsolute(fp) ? fp : resolve(ctx.cwd || getCwd(), fp)

    if (!fp) {
      return {
        content: 'File path is required',
        success: false,
        error: 'Missing file_path',
      }
    }
    if (!fp.endsWith('.ipynb')) {
      return {
        content: 'File must have .ipynb extension',
        success: false,
        error: 'Not a notebook',
      }
    }
    if (!existsSync(fullPath)) {
      return {
        content: `Notebook not found: ${fp}`,
        success: false,
        error: 'Not found',
      }
    }

    let notebook: Notebook
    try {
      const raw = readFileSync(fullPath, 'utf-8')
      notebook = JSON.parse(raw) as Notebook
    } catch {
      return {
        content: `Failed to parse notebook: ${fp}`,
        success: false,
        error: 'Parse error',
      }
    }

    switch (action) {
      case 'list_cells': {
        const lines = [`Notebook: ${fp}`, `Cells: ${notebook.cells.length}`, '']
        for (let i = 0; i < notebook.cells.length; i++) {
          const cell = notebook.cells[i]
          const src = (
            Array.isArray(cell.source) ? cell.source.join('') : cell.source
          )
            .slice(0, 80)
            .replace(/\n/g, ' ')
          lines.push(
            `  [${i}] ${cell.cell_type}: ${src}${src.length >= 80 ? '...' : ''}`,
          )
        }
        return { content: lines.join('\n'), success: true }
      }

      case 'add_cell': {
        const cellType = String(
          input.cell_type ?? 'code',
        ) as NotebookCell['cell_type']
        const source = String(input.source ?? '')

        if (!source) {
          return {
            content: 'Source content is required for add_cell',
            success: false,
            error: 'Missing source',
          }
        }

        const newCell: NotebookCell = {
          cell_type: cellType,
          source,
          metadata: {},
        }
        if (cellType === 'code') {
          newCell.execution_count = null
          newCell.outputs = []
        }

        const index =
          typeof input.cell_index === 'number'
            ? input.cell_index
            : notebook.cells.length
        notebook.cells.splice(index, 0, newCell)
        writeFileSync(fullPath, JSON.stringify(notebook, null, 1), 'utf-8')
        return {
          content: `Cell added at index ${index} (${cellType}). Total: ${notebook.cells.length} cells.`,
          success: true,
        }
      }

      case 'edit_cell': {
        const index = Number(input.cell_index ?? -1)
        if (index < 0 || index >= notebook.cells.length) {
          return {
            content: `Invalid cell index: ${index}. Notebook has ${notebook.cells.length} cells.`,
            success: false,
            error: 'Invalid index',
          }
        }

        const source = String(input.source ?? '')
        if (source) {
          notebook.cells[index].source = source
        }
        const cellType = input.cell_type as string | undefined
        if (cellType && ['code', 'markdown', 'raw'].includes(cellType)) {
          notebook.cells[index].cell_type =
            cellType as NotebookCell['cell_type']
        }

        writeFileSync(fullPath, JSON.stringify(notebook, null, 1), 'utf-8')
        return { content: `Cell ${index} updated.`, success: true }
      }

      case 'delete_cell': {
        const index = Number(input.cell_index ?? -1)
        if (index < 0 || index >= notebook.cells.length) {
          return {
            content: `Invalid cell index: ${index}.`,
            success: false,
            error: 'Invalid index',
          }
        }
        notebook.cells.splice(index, 1)
        writeFileSync(fullPath, JSON.stringify(notebook, null, 1), 'utf-8')
        return {
          content: `Cell ${index} deleted. ${notebook.cells.length} cells remaining.`,
          success: true,
        }
      }

      default:
        return {
          content: `Unknown action: "${action}". Use: list_cells, add_cell, edit_cell, delete_cell`,
          success: false,
          error: 'Invalid action',
        }
    }
  },

  userFacingName: () => 'NotebookEdit',
}
