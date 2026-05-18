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
  buildOrchestratedToolUses,
  orchestrateToolExecution,
  CONCURRENT_SAFE_TOOLS,
} from '../services/tools/toolOrchestration.js'
import type { ToolExecutionRequest } from '../services/tools/toolExecution.js'

function makeTool(
  name: string,
  opts?: {
    concurrencySafe?: boolean
    readOnly?: boolean
  },
): Tool {
  return {
    name,
    description: `Mock ${name}`,
    inputSchema: { type: 'object' as const },
    prompt: `Mock ${name}`,
    execute: async () => ({ content: `${name} result`, success: true }),
    isConcurrencySafe: () =>
      opts?.concurrencySafe ?? CONCURRENT_SAFE_TOOLS.has(name),
    isReadOnly: () => opts?.readOnly ?? CONCURRENT_SAFE_TOOLS.has(name),
    isDestructive: () => false,
    userFacingName: () => name,
  }
}

describe('buildOrchestratedToolUses', () => {
  test('returns tool uses for valid tools', async () => {
    const toolsMap = new Map([['Grep', makeTool('Grep')]])
    const requests: ToolExecutionRequest[] = [
      { id: 't1', name: 'Grep', input: { pattern: 'foo' } },
    ]

    const result = await buildOrchestratedToolUses(requests, toolsMap, '/cwd', {
      canUseTool: async () => true,
    })

    expect(result.tools.length).toBe(1)
    expect(result.unknownTools.length).toBe(0)
    expect(result.deniedTools.length).toBe(0)
    expect(result.tools[0].request.name).toBe('Grep')
  })

  test('reports unknown tools', async () => {
    const toolsMap = new Map<string, Tool>()
    const requests: ToolExecutionRequest[] = [
      { id: 't1', name: 'UnknownTool', input: {} },
    ]

    const result = await buildOrchestratedToolUses(requests, toolsMap, '/cwd')

    expect(result.tools.length).toBe(0)
    expect(result.unknownTools.length).toBe(1)
    expect(result.unknownTools[0].error).toContain('Unknown tool')
  })

  test('reports denied tools', async () => {
    const toolsMap = new Map([['Bash', makeTool('Bash')]])
    const requests: ToolExecutionRequest[] = [
      { id: 't1', name: 'Bash', input: { command: 'rm -rf' } },
    ]

    const result = await buildOrchestratedToolUses(requests, toolsMap, '/cwd', {
      canUseTool: async () => false,
    })

    expect(result.tools.length).toBe(0)
    expect(result.deniedTools.length).toBe(1)
    expect(result.deniedTools[0].error).toContain('Permission denied')
  })
})

describe('orchestrateToolExecution', () => {
  test('executes single tool successfully', async () => {
    const toolsMap = new Map([['Grep', makeTool('Grep')]])
    const requests: ToolExecutionRequest[] = [
      { id: 't1', name: 'Grep', input: { pattern: 'foo' } },
    ]

    const result = await orchestrateToolExecution(requests, toolsMap, '/cwd', {
      canUseTool: async () => true,
    })

    expect(result.results.length).toBe(1)
    expect(result.results[0].success).toBe(true)
    expect(result.results[0].content).toBe('Grep result')
    expect(result.toolResults.length).toBe(1)
  })

  test('executes multiple tools concurrently', async () => {
    const toolsMap = new Map([
      ['Grep', makeTool('Grep')],
      ['Glob', makeTool('Glob')],
      ['Read', makeTool('Read')],
    ])
    const requests: ToolExecutionRequest[] = [
      { id: 't1', name: 'Grep', input: {} },
      { id: 't2', name: 'Glob', input: {} },
      { id: 't3', name: 'Read', input: {} },
    ]

    const result = await orchestrateToolExecution(requests, toolsMap, '/cwd', {
      canUseTool: async () => true,
    })

    expect(result.results.length).toBe(3)
    expect(result.results.every(r => r.success)).toBe(true)
  })

  test('executes mixed concurrent and serial tools', async () => {
    const toolsMap = new Map([
      ['Grep', makeTool('Grep')],
      ['Bash', makeTool('Bash', { concurrencySafe: false })],
    ])
    const requests: ToolExecutionRequest[] = [
      { id: 't1', name: 'Grep', input: {} },
      { id: 't2', name: 'Bash', input: { command: 'ls' } },
    ]

    const result = await orchestrateToolExecution(requests, toolsMap, '/cwd', {
      canUseTool: async () => true,
    })

    expect(result.results.length).toBe(2)
    expect(result.results[0].name).toBe('Grep')
    expect(result.results[1].name).toBe('Bash')
  })

  test('handles unknown tools gracefully', async () => {
    const toolsMap = new Map([['Grep', makeTool('Grep')]])
    const requests: ToolExecutionRequest[] = [
      { id: 't1', name: 'Unknown', input: {} },
      { id: 't2', name: 'Grep', input: {} },
    ]

    const result = await orchestrateToolExecution(requests, toolsMap, '/cwd', {
      canUseTool: async () => true,
    })

    expect(result.results.length).toBe(2)
    const unknown = result.results.find(r => !r.success)
    expect(unknown?.error).toContain('Unknown tool')
    const grep = result.results.find(r => r.success)
    expect(grep?.name).toBe('Grep')
  })

  test('handles permission denial', async () => {
    const toolsMap = new Map([['Bash', makeTool('Bash')]])
    const requests: ToolExecutionRequest[] = [
      { id: 't1', name: 'Bash', input: {} },
    ]

    const result = await orchestrateToolExecution(requests, toolsMap, '/cwd', {
      canUseTool: async () => false,
    })

    expect(result.results.length).toBe(1)
    expect(result.results[0].success).toBe(false)
    expect(result.results[0].content).toBe('Permission denied.')
  })
})
