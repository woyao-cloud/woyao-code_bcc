import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { GrepTool } from '../tools/builtin/GrepTool/GrepTool.js'
import { GlobTool } from '../tools/builtin/GlobTool/GlobTool.js'
import type { ToolUseContext } from '../Tool.js'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const testDir = join(tmpdir(), 'mini-v2-grep-glob-' + Date.now())

beforeEach(() => {
  rmSync(testDir, { recursive: true, force: true })
  mkdirSync(testDir, { recursive: true })
  mkdirSync(join(testDir, 'src'))
  mkdirSync(join(testDir, 'src', 'utils'))
  writeFileSync(
    join(testDir, 'src', 'index.ts'),
    'export const foo = 1;\n',
    'utf-8',
  )
  writeFileSync(
    join(testDir, 'src', 'utils', 'helper.ts'),
    'export function bar() {\n  return 42;\n}\n',
    'utf-8',
  )
  writeFileSync(
    join(testDir, 'README.md'),
    '# Test Project\n\nHello world\n',
    'utf-8',
  )
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

function makeCtx(dir?: string): ToolUseContext {
  return {
    toolUse: { type: 'tool_use', id: 'tu_1', name: '', input: {} },
    permissionMode: 'default',
    toolPermissionContext: {
      mode: 'default',
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      isBypassPermissionsModeAvailable: false,
    },
    cwd: dir ?? testDir,
    abortSignal: new AbortController().signal,
    messages: [],
    isInteractive: false,
  }
}

describe('GrepTool', () => {
  test('finds pattern in files', async () => {
    const result = await GrepTool.execute(makeCtx(), {
      pattern: 'export',
      path: testDir,
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('export')
    expect(result.content).toContain('index.ts')
    expect(result.content).toContain('helper.ts')
  })

  test('finds specific function name', async () => {
    const result = await GrepTool.execute(makeCtx(), {
      pattern: 'bar',
      path: testDir,
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('bar')
  })

  test('returns no matches for non-existent pattern', async () => {
    const result = await GrepTool.execute(makeCtx(), {
      pattern: 'NONEXISTENT_PATTERN_12345',
      path: testDir,
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('No matches found')
  })

  test('handles regex patterns', async () => {
    const result = await GrepTool.execute(makeCtx(), {
      pattern: '\\d{2}',
      path: testDir,
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('42')
  })

  test('handles file include filter', async () => {
    const result = await GrepTool.execute(makeCtx(), {
      pattern: 'export',
      path: testDir,
      include: '*.ts',
    })
    expect(result.success).toBe(true)
    expect(result.content).not.toContain('README.md')
  })

  test('returns error for invalid regex', async () => {
    const result = await GrepTool.execute(makeCtx(), {
      pattern: '[',
      path: testDir,
    })
    expect(result.success).toBe(false)
  })

  test('has user-facing name', () => {
    expect(GrepTool.userFacingName!()).toBe('Grep')
  })
})

describe('GlobTool', () => {
  test('finds files by pattern', async () => {
    const result = await GlobTool.execute(makeCtx(), {
      pattern: 'src/**/*.ts',
      path: testDir,
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('index.ts')
    expect(result.content).toContain('helper.ts')
  })

  test('finds .md files', async () => {
    const result = await GlobTool.execute(makeCtx(), {
      pattern: '*.md',
      path: testDir,
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('README.md')
  })

  test('returns empty for no matches', async () => {
    const result = await GlobTool.execute(makeCtx(), {
      pattern: '*.py',
      path: testDir,
    })
    expect(result.success).toBe(true)
  })

  test('uses cwd when no path specified', async () => {
    const result = await GlobTool.execute(makeCtx(), {
      pattern: '**/*.ts',
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('index.ts')
  })

  test('has user-facing name', () => {
    expect(GlobTool.userFacingName!()).toBe('Glob')
  })
})
