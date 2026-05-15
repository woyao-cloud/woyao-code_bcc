import { describe, test, expect } from 'bun:test'
import { createMCPToolWrapper } from '../tools/builtin/MCPTool/MCPTool.js'
import type {
  MCPEntry,
  MCPTool,
  MCPToolResult,
} from '../services/mcp/mcpClient.js'

// Helper to create a mock MCPEntry for testing
function mockEntry(
  callToolImpl: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<MCPToolResult>,
  tools: MCPTool[],
): MCPEntry {
  return {
    serverName: 'test-server',
    connection: { callTool: callToolImpl } as unknown as MCPEntry['connection'],
    tools,
  }
}

describe('createMCPToolWrapper', () => {
  const mockTool: MCPTool = {
    name: 'test_tool',
    description: 'A test MCP tool',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
    },
  }

  const entry = mockEntry(
    async (name, args) => {
      if (name === 'test_tool') {
        return {
          content: [{ type: 'text', text: `result: ${JSON.stringify(args)}` }],
        }
      }
      return { content: [], isError: true }
    },
    [mockTool],
  )

  const ctx = {
    toolUse: {
      type: 'tool_use' as const,
      id: 't1',
      name: 'test_tool',
      input: {},
    },
    permissionMode: 'default' as const,
    toolPermissionContext: {
      mode: 'default' as const,
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      isBypassPermissionsModeAvailable: false,
    },
    cwd: '/test',
    abortSignal: new AbortController().signal,
    messages: [],
    isInteractive: true,
  }

  test('creates tool with correct name format', () => {
    const tool = createMCPToolWrapper(entry, mockTool)
    expect(tool.name).toBe('mcp__test-server__test_tool')
  })

  test('has description prefixed with server name', () => {
    const tool = createMCPToolWrapper(entry, mockTool)
    expect(tool.description).toContain('[MCP:test-server]')
    expect(tool.description).toContain('A test MCP tool')
  })

  test('preserves inputSchema properties', () => {
    const tool = createMCPToolWrapper(entry, mockTool)
    expect(tool.inputSchema.type).toBe('object')
    expect(tool.inputSchema.required).toContain('key')
  })

  test('produces correct user facing name', () => {
    const tool = createMCPToolWrapper(entry, mockTool)
    expect(tool.userFacingName?.()).toBe('test-server: test_tool')
  })

  test('has a prompt', () => {
    const tool = createMCPToolWrapper(entry, mockTool)
    expect(tool.prompt).toContain('test-server')
  })

  test('executes and returns content', async () => {
    const tool = createMCPToolWrapper(entry, mockTool)
    const result = await tool.execute(ctx, { key: 'value' })
    expect(result.success).toBe(true)
    expect(result.content).toContain('value')
  })

  test('handles empty result', async () => {
    const emptyEntry = mockEntry(
      async () => ({ content: [], isError: false }),
      [{ name: 'empty_tool', description: '', inputSchema: {} }],
    )
    const tool = createMCPToolWrapper(emptyEntry, {
      name: 'empty_tool',
      description: '',
      inputSchema: {},
    })
    const result = await tool.execute(ctx, {})
    expect(result.content).toBe('(empty)')
  })

  test('returns error for failed MCP call', async () => {
    const errorEntry = mockEntry(
      async () => ({ content: [], isError: true }),
      [{ name: 'failing_tool', description: '', inputSchema: {} }],
    )
    const tool = createMCPToolWrapper(errorEntry, {
      name: 'failing_tool',
      description: '',
      inputSchema: {},
    })
    const result = await tool.execute(ctx, {})
    expect(result.success).toBe(false)
  })

  test('handles exception in MCP call', async () => {
    const crashEntry = mockEntry(async () => {
      throw new Error('Connection lost')
    }, [{ name: 'crash_tool', description: '', inputSchema: {} }])
    const tool = createMCPToolWrapper(crashEntry, {
      name: 'crash_tool',
      description: '',
      inputSchema: {},
    })
    const result = await tool.execute(ctx, {})
    expect(result.success).toBe(false)
    expect(result.content).toContain('MCP error')
    expect(result.content).toContain('Connection lost')
  })

  test('tool without inputSchema properties uses empty object', () => {
    const minimalTool: MCPTool = {
      name: 'min_tool',
      description: 'd',
      inputSchema: {},
    }
    const tool = createMCPToolWrapper(entry, minimalTool)
    expect(tool.inputSchema.properties).toBeDefined()
    expect(tool.inputSchema.required).toEqual([])
  })
})
