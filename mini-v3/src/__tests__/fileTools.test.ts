import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { FileReadTool } from '../tools/builtin/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '../tools/builtin/FileWriteTool/FileWriteTool.js'
import { FileEditTool } from '../tools/builtin/FileEditTool/FileEditTool.js'
import type { ToolUseContext } from '../Tool.js'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const testDir = join(tmpdir(), 'mini-v2-file-tests-' + Date.now())

beforeEach(() => {
  rmSync(testDir, { recursive: true, force: true })
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

function makeCtx(): ToolUseContext {
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
    cwd: testDir,
    abortSignal: new AbortController().signal,
    messages: [],
    isInteractive: false,
  }
}

describe('FileReadTool', () => {
  test('reads file content', async () => {
    const fp = join(testDir, 'test.txt')
    writeFileSync(fp, 'hello world', 'utf-8')
    const result = await FileReadTool.execute(makeCtx(), { file_path: fp })
    expect(result.success).toBe(true)
    expect(result.content).toContain('hello world')
  })

  test('returns error for non-existent file', async () => {
    const result = await FileReadTool.execute(makeCtx(), {
      file_path: '/no/such/file.txt',
    })
    expect(result.success).toBe(false)
  })

  test('returns error for empty file_path', async () => {
    const result = await FileReadTool.execute(makeCtx(), { file_path: '' })
    expect(result.success).toBe(false)
  })

  test('supports limit parameter', async () => {
    const fp = join(testDir, 'lines.txt')
    writeFileSync(fp, 'line1\nline2\nline3\nline4\nline5', 'utf-8')
    const result = await FileReadTool.execute(makeCtx(), {
      file_path: fp,
      limit: 3,
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('line1')
    expect(result.content).toContain('line2')
    expect(result.content).toContain('line3')
  })

  test('supports offset parameter', async () => {
    const fp = join(testDir, 'offset.txt')
    writeFileSync(fp, 'a\nb\nc\nd\ne', 'utf-8')
    const result = await FileReadTool.execute(makeCtx(), {
      file_path: fp,
      offset: 2,
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('3\tc')
    expect(result.content).not.toContain('1\ta')
  })

  test('has user-facing name', () => {
    expect(FileReadTool.userFacingName!()).toBe('Read')
  })
})

describe('FileWriteTool', () => {
  test('writes content to file', async () => {
    const fp = join(testDir, 'new.txt')
    const result = await FileWriteTool.execute(makeCtx(), {
      file_path: fp,
      content: 'created content',
    })
    expect(result.success).toBe(true)
    expect(readFileSync(fp, 'utf-8')).toBe('created content')
  })

  test('overwrites existing file', async () => {
    const fp = join(testDir, 'existing.txt')
    writeFileSync(fp, 'old', 'utf-8')
    const result = await FileWriteTool.execute(makeCtx(), {
      file_path: fp,
      content: 'new content',
    })
    expect(result.success).toBe(true)
    expect(readFileSync(fp, 'utf-8')).toBe('new content')
  })

  test('writes empty content to file', async () => {
    const fp = join(testDir, 'empty.txt')
    const result = await FileWriteTool.execute(makeCtx(), {
      file_path: fp,
      content: '',
    })
    expect(result.success).toBe(true)
    expect(readFileSync(fp, 'utf-8')).toBe('')
  })

  test('has user-facing name', () => {
    expect(FileWriteTool.userFacingName!()).toBe('Write')
  })
})

describe('FileEditTool', () => {
  test('replaces text in file', async () => {
    const fp = join(testDir, 'edit.txt')
    writeFileSync(fp, 'hello world', 'utf-8')
    const result = await FileEditTool.execute(makeCtx(), {
      file_path: fp,
      old_string: 'hello',
      new_string: 'hi',
    })
    expect(result.success).toBe(true)
    expect(readFileSync(fp, 'utf-8')).toBe('hi world')
  })

  test('returns error when old_string not found', async () => {
    const fp = join(testDir, 'no-match.txt')
    writeFileSync(fp, 'abc', 'utf-8')
    const result = await FileEditTool.execute(makeCtx(), {
      file_path: fp,
      old_string: 'xyz',
      new_string: '123',
    })
    expect(result.success).toBe(false)
  })

  test('rejects ambiguous replace without replace_all', async () => {
    const fp = join(testDir, 'multi.txt')
    writeFileSync(fp, 'aaa bbb aaa', 'utf-8')
    const result = await FileEditTool.execute(makeCtx(), {
      file_path: fp,
      old_string: 'aaa',
      new_string: 'xxx',
    })
    // Tool should reject because old_string appears 2 times and replace_all is not set
    expect(result.success).toBe(false)
    expect(result.content).toContain('2 matches')
  })

  test('replaces all occurrences with replace_all true', async () => {
    const fp = join(testDir, 'replace-all.txt')
    writeFileSync(fp, 'aaa bbb aaa', 'utf-8')
    const result = await FileEditTool.execute(makeCtx(), {
      file_path: fp,
      old_string: 'aaa',
      new_string: 'xxx',
      replace_all: true,
    })
    expect(result.success).toBe(true)
    expect(readFileSync(fp, 'utf-8')).toBe('xxx bbb xxx')
  })

  test('has user-facing name', () => {
    expect(FileEditTool.userFacingName!()).toBe('Edit')
  })
})
