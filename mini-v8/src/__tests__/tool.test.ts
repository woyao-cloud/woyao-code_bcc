import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  findToolByName,
  toolMatchesName,
  toolToAPISchema,
  buildTool,
  buildStandardTool,
  registerTool,
  unregisterTool,
  getRegisteredTools,
  getRegisteredTool,
  setToolEnabled,
  clearToolRegistry,
  recordToolExecution,
  getToolExecutionHistory,
  clearExecutionHistory,
  getToolsByCategory,
  createSuccessResult,
  createErrorResult,
} from '../Tool.js'
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

const mockToolWithAlias: Tool = {
  name: 'FileRead',
  description: 'Read a file',
  inputSchema: { type: 'object', properties: {} },
  prompt: 'File read tool',
  aliases: ['read', 'fr'],
  category: 'file',
  async execute(): Promise<ToolResult> {
    return { content: 'file content', success: true }
  },
}

function makeToolsMap(tools: Tool[]): Tools {
  const map = new Map<string, Tool>()
  for (const t of tools) map.set(t.name, t)
  return map
}

// Reset registry and history before each test
beforeEach(() => {
  clearToolRegistry()
  clearExecutionHistory()
})

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

  test('finds tool by alias', () => {
    const map = makeToolsMap([mockToolWithAlias])
    const found1 = findToolByName(map, 'read')
    const found2 = findToolByName(map, 'fr')
    expect(found1).toBeDefined()
    expect(found1!.name).toBe('FileRead')
    expect(found2).toBeDefined()
    expect(found2!.name).toBe('FileRead')
  })

  test('finds tool by prefix match', () => {
    const map = makeToolsMap([mockTool])
    const found = findToolByName(map, 'Mock')
    expect(found).toBeDefined()
    expect(found!.name).toBe('MockTool')
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

  test('returns true for alias match', () => {
    expect(toolMatchesName(mockToolWithAlias, 'read')).toBe(true)
    expect(toolMatchesName(mockToolWithAlias, 'fr')).toBe(true)
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

describe('buildTool', () => {
  test('builds a tool with required fields', () => {
    const tool = buildTool({
      name: 'TestTool',
      description: 'Test description',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      prompt: 'Test prompt',
      execute: async () => ({ content: 'ok', success: true }),
    })
    expect(tool.name).toBe('TestTool')
    expect(tool.description).toBe('Test description')
    expect(tool.category).toBe('other')
    expect(tool.requiresConfirmation).toBe(false)
    expect(tool.deprecated).toBe(false)
  })

  test('throws error when required fields are missing', () => {
    expect(() =>
      buildTool({
        name: '',
        description: 'Test',
        inputSchema: { type: 'object', properties: {} },
        prompt: 'Test',
        execute: async () => ({ content: 'ok', success: true }),
      }),
    ).toThrow('Tool name is required')
  })

  test('sets default values for optional fields', () => {
    const tool = buildTool({
      name: 'TestTool',
      description: 'Test',
      inputSchema: { type: 'object', properties: {} },
      prompt: 'Test',
      execute: async () => ({ content: 'ok', success: true }),
    })
    expect(tool.aliases).toEqual([])
    expect(tool.requiresConfirmation).toBe(false)
    expect(tool.deprecated).toBe(false)
  })
})

describe('buildStandardTool', () => {
  test('builds a standard tool', () => {
    const tool = buildStandardTool({
      name: 'StandardTool',
      description: 'Standard tool',
      inputSchema: { type: 'object', properties: {} },
      prompt: 'Standard prompt',
      execute: async () => ({ content: 'ok', success: true }),
    })
    expect(tool.name).toBe('StandardTool')
  })
})

describe('Tool Registry', () => {
  test('registers and retrieves a tool', () => {
    registerTool(mockTool)
    const tools = getRegisteredTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].name).toBe('MockTool')
  })

  test('registers tool aliases', () => {
    registerTool(mockToolWithAlias)
    const toolByName = getRegisteredTool('FileRead')
    const toolByAlias = getRegisteredTool('read')
    expect(toolByName).toBeDefined()
    expect(toolByAlias).toBeDefined()
    expect(toolByName!.name).toBe('FileRead')
    expect(toolByAlias!.name).toBe('FileRead')
  })

  test('unregisters a tool and its aliases', () => {
    registerTool(mockToolWithAlias)
    unregisterTool('FileRead')
    expect(getRegisteredTool('FileRead')).toBeUndefined()
    expect(getRegisteredTool('read')).toBeUndefined()
  })

  test('can disable a tool', () => {
    registerTool(mockTool)
    setToolEnabled('MockTool', false)
    const enabledTools = getRegisteredTools(false)
    const allTools = getRegisteredTools(true)
    expect(enabledTools).toHaveLength(0)
    expect(allTools).toHaveLength(1)
  })

  test('clears registry', () => {
    registerTool(mockTool)
    registerTool(mockTool2)
    clearToolRegistry()
    expect(getRegisteredTools()).toHaveLength(0)
  })
})

describe('Tool Execution History', () => {
  test('records and retrieves execution history', () => {
    recordToolExecution({
      toolName: 'TestTool',
      startTime: Date.now(),
      success: true,
      input: { param: 'value' },
    })
    const history = getToolExecutionHistory()
    expect(history).toHaveLength(1)
    expect(history[0].toolName).toBe('TestTool')
  })

  test('clears execution history', () => {
    recordToolExecution({ toolName: 'TestTool', startTime: Date.now() })
    clearExecutionHistory()
    expect(getToolExecutionHistory()).toHaveLength(0)
  })
})

describe('Tool Helpers', () => {
  test('groups tools by category', () => {
    const fileTool = { ...mockToolWithAlias, name: 'FileTool' }
    const searchTool = { ...mockTool, name: 'SearchTool', category: 'search' }
    const grouped = getToolsByCategory([fileTool, searchTool])
    expect(grouped.get('file')).toHaveLength(1)
    expect(grouped.get('search')).toHaveLength(1)
  })

  test('creates success result', () => {
    const result = createSuccessResult('All good', { foo: 'bar' })
    expect(result.success).toBe(true)
    expect(result.content).toBe('All good')
    expect(result.metadata).toEqual({ foo: 'bar' })
  })

  test('creates error result', () => {
    const result = createErrorResult('Something broke')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Something broke')
    expect(result.content).toContain('Something broke')
  })
})
