import { describe, expect, test } from 'bun:test'
import { BashTool } from '../tools/builtin/BashTool/BashTool.js'
import type { ToolUseContext } from '../Tool.js'

function makeCtx(dir?: string): ToolUseContext {
  return {
    toolUse: { type: 'tool_use', id: 'tu_1', name: 'Bash', input: {} },
    permissionMode: 'default',
    toolPermissionContext: {
      mode: 'default',
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      isBypassPermissionsModeAvailable: false,
    },
    cwd: dir ?? process.cwd(),
    abortSignal: new AbortController().signal,
    messages: [],
    isInteractive: false,
  }
}

describe('BashTool', () => {
  test('executes echo command', async () => {
    const cmd = process.platform === 'win32' ? 'echo hello' : 'echo hello'
    const result = await BashTool.execute(makeCtx(), { command: cmd })
    expect(result.success).toBe(true)
    expect(result.content).toContain('hello')
  })

  test('returns failure for empty command', async () => {
    const result = await BashTool.execute(makeCtx(), { command: '' })
    expect(result.success).toBe(false)
  })

  test('returns failure for invalid command', async () => {
    const result = await BashTool.execute(makeCtx(), {
      command: 'nonexistent_cmd_12345_abc',
    })
    expect(result.success).toBe(false)
  })

  test('sets user-facing name', () => {
    expect(BashTool.userFacingName!()).toBe('Bash')
  })

  test('returns correct exit code for successful command', async () => {
    const cmd = process.platform === 'win32' ? 'ver' : 'true'
    const result = await BashTool.execute(makeCtx(), { command: cmd })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Exit: 0')
  })
})
