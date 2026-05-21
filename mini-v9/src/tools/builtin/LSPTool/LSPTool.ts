import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { getCwd } from '../../../bootstrap/state.js'
import {
  getLSPClient,
  stopAllLSPServers,
  getActiveLSPServers,
} from '../../../services/lsp/manager.js'
import { readFileSync, existsSync } from 'fs'

export const LSPTool: Tool = {
  name: 'LSP',
  description:
    'Query language server for code intelligence. Supports hover (type info), definition (go to def), references (find usages), and completions. Requires a language server (typescript-language-server for TS/JS, pyright for Python).',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: [
          'hover',
          'definition',
          'references',
          'completions',
          'servers',
          'stop',
        ],
        description: 'LSP operation to perform',
      },
      file_path: {
        type: 'string',
        description:
          'Path to the file (required for hover/definition/references/completions)',
      },
      line: {
        type: 'number',
        description:
          'Line number (0-based, required for hover/definition/references/completions)',
      },
      column: {
        type: 'number',
        description:
          'Column number (0-based, required for hover/definition/references/completions)',
      },
    },
    required: ['command'],
  },
  prompt:
    'LSP tool: query language server for code intelligence. Use "hover" to get type info at a position, "definition" to find where a symbol is defined, "references" to find all usages, "completions" to get completion suggestions.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const command = String(input.command ?? '')
      .trim()
      .toLowerCase()
    const cwd = ctx.cwd || getCwd()

    if (command === 'servers') {
      const servers = getActiveLSPServers()
      if (servers.length === 0) {
        return {
          content:
            'No active LSP servers. Use hover/definition/references to auto-start one.',
          success: true,
        }
      }
      return {
        content: `Active LSP servers:\n${servers.map(s => `  - ${s}`).join('\n')}`,
        success: true,
      }
    }

    if (command === 'stop') {
      await stopAllLSPServers()
      return { content: 'All LSP servers stopped.', success: true }
    }

    const filePath = String(input.file_path ?? '').trim()
    if (!filePath) {
      return {
        content: 'file_path is required for this command',
        success: false,
        error: 'Missing file_path',
      }
    }

    if (!existsSync(filePath)) {
      return {
        content: `File not found: ${filePath}`,
        success: false,
        error: 'File not found',
      }
    }

    const line = Number(input.line ?? 0)
    const col = Number(input.column ?? 0)

    const client = await getLSPClient(filePath, cwd)
    if (!client) {
      return {
        content:
          `Could not start LSP server for "${filePath}". Supported: .ts, .tsx, .js, .jsx, .py\n` +
          'Install with: npm install -g typescript-language-server (for TS/JS) or pip install pyright (for Python)',
        success: false,
        error: 'No LSP server available',
      }
    }

    try {
      let result: string
      switch (command) {
        case 'hover':
          result = await client.getHover(filePath, line, col)
          break
        case 'definition':
          result = await client.getDefinition(filePath, line, col)
          break
        case 'references':
          result = await client.getReferences(filePath, line, col)
          break
        case 'completions':
          result = await client.getCompletions(filePath, line, col)
          break
        default:
          return {
            content: `Unknown command: "${command}". Use: hover, definition, references, completions, servers, stop`,
            success: false,
            error: 'Invalid command',
          }
      }
      return { content: result || '(empty)', success: true }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `LSP error: ${msg}`, success: false, error: msg }
    }
  },

  userFacingName: () => 'LSP',
}
