import { describe, expect, test } from 'bun:test'
import { MonitorTool } from '../tools/builtin/MonitorTool/MonitorTool.js'
import type { ToolUseContext } from '../Tool.js'

const mockCtx: ToolUseContext = {
  toolUse: { type: 'tool_use', id: 'test', name: 'Monitor', input: {} },
  permissionMode: 'default',
  toolPermissionContext: {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    isBypassPermissionsModeAvailable: false,
  },
  cwd: '/test',
  abortSignal: new AbortController().signal,
  messages: [],
  isInteractive: false,
}

describe('MonitorTool', () => {
  test('start action requires command', async () => {
    const result = await MonitorTool.execute(mockCtx, {
      action: 'start',
      description: 'test',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Missing command')
  })

  test('start action requires description', async () => {
    const result = await MonitorTool.execute(mockCtx, {
      action: 'start',
      command: 'ls',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Missing description')
  })

  test('start creates a monitor', async () => {
    const result = await MonitorTool.execute(mockCtx, {
      action: 'start',
      command: 'tail -f log.txt',
      description: 'Watch log file',
      pattern: 'ERROR',
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Monitor started')
    expect(result.content).toContain('ERROR')
  })

  test('list returns active monitors', async () => {
    await MonitorTool.execute(mockCtx, {
      action: 'start',
      command: 'ping localhost',
      description: 'Ping test',
    })
    const result = await MonitorTool.execute(mockCtx, { action: 'list' })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Active monitors')
  })

  test('stop requires monitor ID', async () => {
    const result = await MonitorTool.execute(mockCtx, { action: 'stop' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Missing monitor ID')
  })

  test('stop returns error for unknown ID', async () => {
    const result = await MonitorTool.execute(mockCtx, {
      action: 'stop',
      id: 'nonexistent',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Monitor not found')
  })

  test('unknown action returns error', async () => {
    const result = await MonitorTool.execute(mockCtx, {
      action: 'unknown',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Unknown action')
  })

  test('has correct name and description', () => {
    expect(MonitorTool.name).toBe('Monitor')
    expect(MonitorTool.description).toBeTruthy()
    expect(MonitorTool.inputSchema).toBeDefined()
  })
})
