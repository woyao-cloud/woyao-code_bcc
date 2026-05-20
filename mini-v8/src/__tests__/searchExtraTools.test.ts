import { describe, test, expect, beforeEach } from 'bun:test'
import { getTools, getDeferredTools } from '../tools/tools.js'
import { SearchExtraToolsTool } from '../tools/builtin/SearchExtraToolsTool/SearchExtraToolsTool.js'
import { ExecuteTool } from '../tools/builtin/ExecuteTool/ExecuteTool.js'
import { isDeferredTool } from '../tools/builtin/SearchExtraToolsTool/prompt.js'
import type { ToolUseContext } from '../Tool.js'
import { getEmptyToolPermissionContext } from '../types/permissions.js'

function makeContext(overrides: Partial<ToolUseContext> = {}): ToolUseContext {
  return {
    toolUse: {
      type: 'tool_use',
      id: 'test-tool-use',
      name: 'test',
      input: {},
    },
    permissionMode: 'default' as const,
    toolPermissionContext: getEmptyToolPermissionContext(),
    cwd: process.cwd(),
    abortSignal: new AbortController().signal,
    messages: [],
    isInteractive: true,
    ...overrides,
  }
}

describe('isDeferredTool', () => {
  test('core tools are not deferred', () => {
    const tools = getTools()
    const core = tools.find(t => t.name === 'Bash')
    expect(core).toBeDefined()
    expect(isDeferredTool(core!)).toBe(false)
  })

  test('non-core tools are deferred', () => {
    const tools = getTools()
    const cron = tools.find(t => t.name === 'CronCreate')
    expect(cron).toBeDefined()
    expect(isDeferredTool(cron!)).toBe(true)
  })

  test('SearchExtraTools itself is not deferred', () => {
    const tools = getTools()
    const search = tools.find(t => t.name === 'SearchExtraTools')
    expect(search).toBeDefined()
    expect(isDeferredTool(search!)).toBe(false)
  })

  test('ExecuteExtraTool is not deferred', () => {
    const tools = getTools()
    const exec = tools.find(t => t.name === 'ExecuteExtraTool')
    expect(exec).toBeDefined()
    expect(isDeferredTool(exec!)).toBe(false)
  })
})

describe('getDeferredTools', () => {
  test('returns only deferred tools', () => {
    const deferred = getDeferredTools()
    expect(deferred.length).toBeGreaterThan(0)
    for (const t of deferred) {
      expect(isDeferredTool(t)).toBe(true)
    }
  })

  test('does not include core tools', () => {
    const deferred = getDeferredTools()
    const coreNames = deferred.map(t => t.name)
    expect(coreNames).not.toContain('Bash')
    expect(coreNames).not.toContain('Read')
    expect(coreNames).not.toContain('Write')
    expect(coreNames).not.toContain('Edit')
  })
})

describe('SearchExtraToolsTool', () => {
  test('select: mode picks tools by name', async () => {
    const ctx = makeContext()
    const result = await SearchExtraToolsTool.execute(ctx, {
      query: 'select:CronCreate,CronList',
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('CronCreate')
    expect(result.content).toContain('CronList')
    expect(result.content).toContain('ExecuteExtraTool')
  })

  test('select: mode reports core tools as already loaded', async () => {
    const ctx = makeContext()
    const result = await SearchExtraToolsTool.execute(ctx, {
      query: 'select:Bash',
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('already loaded')
  })

  test('select: mode reports not found tools', async () => {
    const ctx = makeContext()
    const result = await SearchExtraToolsTool.execute(ctx, {
      query: 'select:NonexistentTool',
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('NOT FOUND')
  })

  test('discover: mode finds tools by TF-IDF', async () => {
    const ctx = makeContext()
    const result = await SearchExtraToolsTool.execute(ctx, {
      query: 'discover:schedule cron jobs',
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('CronCreate')
  })

  test('keyword search finds matching tools', async () => {
    const ctx = makeContext()
    const result = await SearchExtraToolsTool.execute(ctx, {
      query: 'team',
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('TeamCreate')
    expect(result.content).toContain('TeamDelete')
  })

  test('handles empty query', async () => {
    const ctx = makeContext()
    const result = await SearchExtraToolsTool.execute(ctx, {
      query: '',
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Missing query')
  })

  test('respects limit', async () => {
    const ctx = makeContext()
    const result = await SearchExtraToolsTool.execute(ctx, {
      query: 'tool',
      limit: 2,
    })
    expect(result.success).toBe(true)
    const nameMatches = result.content.match(/\(score:/g)
    if (nameMatches) {
      expect(nameMatches.length).toBeLessThanOrEqual(2)
    }
  })
})

describe('ExecuteTool', () => {
  test('executes a deferred tool by name', async () => {
    const ctx = makeContext()
    const result = await ExecuteTool.execute(ctx, {
      tool_name: 'CronCreate',
      params: { expression: 'daily', command: 'test' },
    })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Cron job created')
  })

  test('returns error for unknown tool', async () => {
    const ctx = makeContext()
    const result = await ExecuteTool.execute(ctx, {
      tool_name: 'NonExistentTool',
      params: {},
    })
    expect(result.success).toBe(false)
    expect(result.content).toContain('not found')
    expect(result.content).toContain('SearchExtraTools')
  })

  test('returns error for missing tool_name', async () => {
    const ctx = makeContext()
    const result = await ExecuteTool.execute(ctx, {
      tool_name: '',
      params: {},
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Missing tool_name')
  })

  test('can execute core tools via proxy', async () => {
    const ctx = makeContext()
    const result = await ExecuteTool.execute(ctx, {
      tool_name: 'Read',
      params: { file_path: 'nonexistent.txt' },
    })
    // Core tools should work — error about file not found is expected
    expect(result.metadata?.tool_name).toBe('Read')
  })
})
