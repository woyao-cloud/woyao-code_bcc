import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { ApplyPatchTool } from '../tools/builtin/ApplyPatchTool/ApplyPatchTool.js'
import type { ToolUseContext } from '../Tool.js'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const testDir = join(tmpdir(), 'mini-v3-patch-' + Date.now())

beforeEach(() => {
  rmSync(testDir, { recursive: true, force: true })
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

function makeCtx(): ToolUseContext {
  return {
    toolUse: { type: 'tool_use', id: 'tu_1', name: 'ApplyPatch', input: {} },
    permissionMode: 'default',
    toolPermissionContext: {
      mode: 'default',
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      isBypassPermissionsModeAvailable: false,
    },
    cwd: testDir,
    abortSignal: new AbortController().signal,
    messages: [],
    isInteractive: false,
  }
}

describe('ApplyPatchTool', () => {
  test('applies simple add patch', async () => {
    const fp = join(testDir, 'test.txt')
    writeFileSync(fp, 'line1\nline2\nline3\n', 'utf-8')

    const patch = '@@ -1,3 +1,4 @@\n line1\n line2\n+added line\n line3'
    const result = await ApplyPatchTool.execute(makeCtx(), {
      file_path: fp,
      patch,
    })
    expect(result.success).toBe(true)
    const content = readFileSync(fp, 'utf-8')
    expect(content).toContain('added line')
    expect(content).toContain('line1')
    expect(content).toContain('line3')
  })

  test('applies remove patch', async () => {
    const fp = join(testDir, 'remove.txt')
    writeFileSync(fp, 'keep\nremove me\nkeep2\n', 'utf-8')

    const patch = '@@ -1,3 +1,2 @@\n keep\n-remove me\n keep2'
    const result = await ApplyPatchTool.execute(makeCtx(), {
      file_path: fp,
      patch,
    })
    expect(result.success).toBe(true)
    const content = readFileSync(fp, 'utf-8')
    expect(content).not.toContain('remove me')
    expect(content).toContain('keep')
  })

  test('returns error for missing file', async () => {
    const result = await ApplyPatchTool.execute(makeCtx(), {
      file_path: '/nonexistent/file.txt',
      patch: '@@ -1 +1 @@\n-old\n+new',
    })
    expect(result.success).toBe(false)
  })

  test('returns error for empty parameters', async () => {
    const result = await ApplyPatchTool.execute(makeCtx(), {
      file_path: '',
      patch: '',
    })
    expect(result.success).toBe(false)
  })

  test('has user-facing name', () => {
    expect(ApplyPatchTool.userFacingName!()).toBe('ApplyPatch')
  })
})
