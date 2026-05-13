import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import type { MCPEntry } from '../../../services/mcp/mcpClient.js'

export function createMCPToolWrapper(
  mcpEntry: MCPEntry,
  mcpTool: {
    name: string
    description: string
    inputSchema: Record<string, unknown>
  },
): Tool {
  return {
    name: 'mcp__' + mcpEntry.serverName + '__' + mcpTool.name,
    description: '[MCP:' + mcpEntry.serverName + '] ' + mcpTool.description,
    inputSchema: {
      type: 'object',
      properties:
        (mcpTool.inputSchema.properties as Record<string, unknown>) ||
        ({} as Record<string, unknown>),
      required: (mcpTool.inputSchema.required as string[]) || [],
    },
    prompt: 'MCP tool from: ' + mcpEntry.serverName,
    async execute(
      _ctx: ToolUseContext,
      input: Record<string, unknown>,
    ): Promise<ToolResult> {
      try {
        const result = await mcpEntry.connection.callTool(mcpTool.name, input)
        const text = result.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n')
        return { content: text || '(empty)', success: !result.isError }
      } catch (err) {
        return {
          content: 'MCP error: ' + String(err),
          success: false,
          error: String(err),
        }
      }
    },
    userFacingName: () => mcpEntry.serverName + ': ' + mcpTool.name,
  }
}
