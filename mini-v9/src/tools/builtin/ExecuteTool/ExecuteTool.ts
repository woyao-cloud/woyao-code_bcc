import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { findToolByName } from '../../../Tool.js'
import { EXECUTE_TOOL_NAME } from './constants.js'

// Module-level tool list getter — same pattern as SearchExtraToolsTool.
let toolListProvider: (() => Tool[]) | null = null

export function setExecuteToolListProvider(fn: () => Tool[]): void {
  toolListProvider = fn
}

export const ExecuteTool: Tool = {
  name: EXECUTE_TOOL_NAME,
  description:
    'Execute a deferred tool that was discovered via SearchExtraTools. Provide the tool_name and params to invoke any deferred tool.',
  inputSchema: {
    type: 'object',
    properties: {
      tool_name: {
        type: 'string',
        description:
          'Name of the deferred tool to execute (discovered via SearchExtraTools).',
      },
      params: {
        type: 'object',
        description: 'Parameters to pass to the target tool.',
      },
    },
    required: ['tool_name', 'params'],
  },
  prompt:
    'ExecuteExtraTool invokes deferred tools discovered via SearchExtraTools. Use it with {tool_name: "<name>", params: {...}}. Core tools (Read, Write, Edit, Bash, etc.) are called directly — do NOT use ExecuteExtraTool for them.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const toolName = String(input.tool_name ?? '').trim()
    const params = (input.params ?? {}) as Record<string, unknown>

    if (!toolName) {
      return {
        content: 'tool_name is required.',
        success: false,
        error: 'Missing tool_name',
      }
    }

    const allTools = toolListProvider?.() ?? []
    const toolsMap = new Map<string, Tool>()
    for (const t of allTools) toolsMap.set(t.name, t)

    const targetTool = findToolByName(toolsMap, toolName)

    if (!targetTool) {
      return {
        content: `Tool "${toolName}" not found. Use SearchExtraTools to discover available deferred tools.`,
        success: false,
        error: 'Tool not found',
      }
    }

    // Permission check
    if (targetTool.checkPermissions) {
      const permResult = await targetTool.checkPermissions(ctx, params)
      if (permResult.behavior === 'deny') {
        return {
          content: `Permission denied for tool "${toolName}": ${permResult.rationale ?? 'Not allowed'}`,
          success: false,
          error: 'Permission denied',
        }
      }
    }

    // Delegate to the target tool
    try {
      const result = await targetTool.execute(ctx, params)
      return {
        content: result.content,
        success: result.success,
        error: result.error,
        metadata: { tool_name: toolName, ...result.metadata },
      }
    } catch (err) {
      return {
        content: `Error executing "${toolName}": ${err instanceof Error ? err.message : String(err)}`,
        success: false,
        error: 'Execution error',
        metadata: { tool_name: toolName },
      }
    }
  },

  userFacingName: () => 'ExecuteExtraTool',
}
