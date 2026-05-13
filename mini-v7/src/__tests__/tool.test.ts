import { describe, expect, test } from 'bun:test'
import { findToolByName, toolMatchesName, toolToAPISchema } from '../Tool.js'
import type { Tool, Tools, ToolUseContext, ToolResult } from '../Tool.js'

const mockTool: Tool = {
  name: 'MockTool',
  description: 'A mock tool for testing',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'A message' },
    },
    required: ['message'],
  },
  prompt: 'Mock tool prompt',
  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    return {
      content: 'Mock executed with: ' + String(input.message),
      success: true,
    }
  },
  userFacingName: () => 'Mock Tool',
}

const mockTool2: Tool = {
  name: 'OtherTool',
  description: 'Another tool',
  inputSchema: { type: 'object', properties: {} },
  prompt: 'Other tool prompt',
  async execute(): Promise<ToolResult> {
    return { content: 'done', success: true }
  },
}

function makeToolsMap(tools: Tool[]): Tools {
  const map = new Map<string, Tool>()
  for (const t of tools) map.set(t.name, t)
  return map
}

describe('findToolByName', () => {
  test('returns tool by exact name match', () => {
    const map = makeToolsMap([mockTool, mockTool2])
    const found = findToolByName(map, 'MockTool')
    expect(found).toBeDefined()
    expect(found!.name).toBe('MockTool')
  })

  test('returns undefined for non-existent tool', () => {
    const map = makeToolsMap([mockTool])
    expect(findToolByName(map, 'NonExistent')).toBeUndefined()
  })

  test('returns undefined for empty map', () => {
    const map = makeToolsMap([])
    expect(findToolByName(map, 'MockTool')).toBeUndefined()
  })
})

describe('toolMatchesName', () => {
  test('returns true for exact name match', () => {
    expect(toolMatchesName(mockTool, 'MockTool')).toBe(true)
  })

  test('returns false for different name', () => {
    expect(toolMatchesName(mockTool, 'OtherTool')).toBe(false)
  })

  test('returns false for partial match', () => {
    expect(toolMatchesName(mockTool, 'Mock')).toBe(false)
  })
})

describe('toolToAPISchema', () => {
  test('converts tool to API schema', () => {
    const schema = toolToAPISchema(mockTool)
    expect(schema).toHaveProperty('name', 'MockTool')
    expect(schema).toHaveProperty('description', 'A mock tool for testing')
    expect(schema).toHaveProperty('input_schema')
  })
})

describe('Tool.execute', () => {
  test('executes mock tool and returns result', async () => {
    const ctx: ToolUseContext = {
      toolUse: {
        type: 'tool_use',
        id: 'tu_1',
        name: 'MockTool',
        input: { message: 'hello' },
      },
      permissionMode: 'default',
      toolPermissionContext: {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        isBypassPermissionsModeAvailable: false,
      },
      cwd: '/tmp',
      abortSignal: new AbortController().signal,
      messages: [],
      isInteractive: false,
    }
    const result = await mockTool.execute(ctx, { message: 'hello' })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Mock executed with: hello')
  })

  test('returns failed result from tool', async () => {
    const failingTool: Tool = {
      ...mockTool,
      name: 'FailingTool',
      async execute(): Promise<ToolResult> {
        return { content: 'Oops', success: false, error: 'Something broke' }
      },
    }
    const ctx = {
      toolUse: {
        type: 'tool_use' as const,
        id: 'tu_2',
        name: 'FailingTool',
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
      cwd: '/tmp',
      abortSignal: new AbortController().signal,
      messages: [],
      isInteractive: false,
    }
    const result = await failingTool.execute(ctx, {})
    expect(result.success).toBe(false)
    expect(result.error).toBe('Something broke')
  })
})
