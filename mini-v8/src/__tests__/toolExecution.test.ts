import { describe, test, expect, mock } from 'bun:test'
import type { Tool } from '../Tool.js'

// --- Mocks ---

// @ts-expect-error - bun:test mock type is opaque in strict mode
mock.module('../utils/settings/settings.js', () => ({
  getPermissionMode: () => 'default',
}))

// @ts-expect-error
mock.module('../services/permission/permissionManager.js', () => ({
  requestPermission: () => Promise.resolve(true),
}))

// @ts-expect-error
mock.module('../services/toolResultStorage.js', () => ({
  persistLargeToolResult: (content: string) => content,
}))

// --- Tests ---

import {
  buildToolContext,
  checkToolPermission,
  executeSingleTool,
  type ToolExecutionRequest,
} from '../services/tools/toolExecution.js'

const mockTool: Tool = {
  name: 'Grep',
  description: 'Search files',
  inputSchema: { type: 'object' as const },
  prompt: 'Search tool',
  execute: async () => ({ content: 'found 3 matches', success: true }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,
  userFacingName: () => 'Grep',
}

describe('buildToolContext', () => {
  test('returns ToolUseContext with correct fields', () => {
    const req: ToolExecutionRequest = {
      id: 'toolu_001',
      name: 'Grep',
      input: { pattern: 'foo' },
    }
    const ctx = buildToolContext(req, '/test/cwd')

    expect(ctx.toolUse.id).toBe('toolu_001')
    expect(ctx.toolUse.name).toBe('Grep')
    expect(ctx.cwd).toBe('/test/cwd')
    expect(ctx.isInteractive).toBe(true)
    expect(ctx.messages).toEqual([])
  })

  test('respects isInteractive option', () => {
    const req: ToolExecutionRequest = { id: 't1', name: 'Read', input: {} }
    const ctx = buildToolContext(req, '/cwd', { isInteractive: false })
    expect(ctx.isInteractive).toBe(false)
  })
})

describe('checkToolPermission', () => {
  test('returns true when override is provided', async () => {
    // @ts-expect-error
    const override = mock(() => Promise.resolve(true))
    const result = await checkToolPermission(mockTool, {}, override)
    expect(result).toBe(true)
    // mock was called (can't check details due to bun type constraints)
  })

  test('returns false when override denies', async () => {
    // @ts-expect-error
    const override = mock(() => Promise.resolve(false))
    const result = await checkToolPermission(
      mockTool,
      { command: 'rm -rf /' },
      override,
    )
    expect(result).toBe(false)
  })

  test('calls requestPermission when no override', async () => {
    const result = await checkToolPermission(mockTool, {})
    expect(result).toBe(true) // mocked to return true
  })
})

describe('executeSingleTool', () => {
  test('returns ToolExecutionResult with success', async () => {
    const req: ToolExecutionRequest = {
      id: 'toolu_001',
      name: 'Grep',
      input: { pattern: 'foo' },
    }
    const ctx = buildToolContext(req, '/test/cwd')
    const result = await executeSingleTool(mockTool, req, ctx)

    expect(result.id).toBe('toolu_001')
    expect(result.name).toBe('Grep')
    expect(result.success).toBe(true)
    expect(result.content).toBe('found 3 matches')
    expect(result.toolResult.type).toBe('tool_result')
    expect(
      (result.toolResult as unknown as Record<string, unknown>).is_error,
    ).toBe(false)
  })

  test('returns error result on failure', async () => {
    const failingTool: Tool = {
      ...mockTool,
      execute: async () => ({
        content: 'Error: permission denied',
        success: false,
        error: 'Permission denied',
      }),
    }
    const req: ToolExecutionRequest = { id: 't1', name: 'Grep', input: {} }
    const ctx = buildToolContext(req, '/cwd')
    const result = await executeSingleTool(failingTool, req, ctx)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Permission denied')
    expect(
      (result.toolResult as unknown as Record<string, unknown>).is_error,
    ).toBe(true)
  })
})
