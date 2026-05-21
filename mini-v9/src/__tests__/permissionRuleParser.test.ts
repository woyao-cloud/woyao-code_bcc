import { describe, test, expect } from 'bun:test'
import {
  parsePermissionRule,
  matchGlobPattern,
  ruleMatchesToolUse,
} from '../services/permission/permissionRuleParser.js'
import { hasPermissionsToUseTool } from '../services/permission/permissions.js'
import type { Tool } from '../Tool.js'

describe('permissionRuleParser', () => {
  test('parses allow rule with pattern', () => {
    const result = parsePermissionRule('allow: Bash(git *)')
    expect(result.success).toBe(true)
    expect(result.rule?.behavior).toBe('allow')
    expect(result.rule?.toolName).toBe('Bash')
    expect(result.rule?.pattern).toBe('git *')
  })

  test('parses deny rule without pattern', () => {
    const result = parsePermissionRule('deny: Write')
    expect(result.success).toBe(true)
    expect(result.rule?.behavior).toBe('deny')
    expect(result.rule?.toolName).toBe('Write')
    expect(result.rule?.pattern).toBe('*')
  })

  test('parses ask rule', () => {
    const result = parsePermissionRule('ask: Bash(rm *)')
    expect(result.success).toBe(true)
    expect(result.rule?.behavior).toBe('ask')
  })

  test('rejects invalid format', () => {
    const result = parsePermissionRule('invalid string')
    expect(result.success).toBe(false)
  })

  test('rejects empty input', () => {
    const result = parsePermissionRule('  ')
    expect(result.success).toBe(false)
  })
})

describe('matchGlobPattern', () => {
  test('wildcard matches everything', () => {
    expect(matchGlobPattern('*', 'anything')).toBe(true)
  })

  test('exact match', () => {
    expect(matchGlobPattern('git status', 'git status')).toBe(true)
    expect(matchGlobPattern('git status', 'git push')).toBe(false)
  })

  test('prefix wildcard', () => {
    expect(matchGlobPattern('git *', 'git status')).toBe(true)
    expect(matchGlobPattern('git *', 'git push origin main')).toBe(true)
    expect(matchGlobPattern('git *', 'npm install')).toBe(false)
  })

  test('suffix wildcard', () => {
    expect(matchGlobPattern('*.ts', 'index.ts')).toBe(true)
    expect(matchGlobPattern('*.ts', 'index.js')).toBe(false)
  })
})

describe('ruleMatchesToolUse', () => {
  const bashRule = parsePermissionRule('deny: Bash(rm *)').rule!
  const writeRule = parsePermissionRule('allow: Write(src/*)').rule!

  test('Bash rule matches rm command', () => {
    expect(ruleMatchesToolUse(bashRule, 'Bash', { command: 'rm -rf /' })).toBe(
      true,
    )
  })

  test('Bash rule does not match git command', () => {
    expect(
      ruleMatchesToolUse(bashRule, 'Bash', { command: 'git status' }),
    ).toBe(false)
  })

  test('Write rule matches src path', () => {
    expect(
      ruleMatchesToolUse(writeRule, 'Write', { file_path: 'src/index.ts' }),
    ).toBe(true)
  })

  test('Write rule does not match other path', () => {
    expect(
      ruleMatchesToolUse(writeRule, 'Write', {
        file_path: 'config/settings.json',
      }),
    ).toBe(false)
  })
})

describe('hasPermissionsToUseTool', () => {
  const readOnlyTool: Tool = {
    name: 'Glob',
    description: 'Find files',
    inputSchema: { type: 'object' },
    prompt: 'test',
    isReadOnly: () => true,
    isDestructive: () => false,
    execute: async () => ({ content: '', success: true }),
  }

  const destructiveTool: Tool = {
    name: 'Bash',
    description: 'Run command',
    inputSchema: { type: 'object' },
    prompt: 'test',
    isReadOnly: () => false,
    isDestructive: () => true,
    execute: async () => ({ content: '', success: true }),
  }

  test('bypass mode allows everything', () => {
    const result = hasPermissionsToUseTool({
      mode: 'bypassPermissions',
      rules: [],
      tool: destructiveTool,
      input: {},
    })
    expect(result.behavior).toBe('allow')
  })

  test('deny rule blocks tool', () => {
    const rmRule = parsePermissionRule('deny: Bash(rm *)').rule!
    const result = hasPermissionsToUseTool({
      mode: 'default',
      rules: [rmRule],
      tool: destructiveTool,
      input: { command: 'rm -rf /' },
    })
    expect(result.behavior).toBe('deny')
  })

  test('read-only tools are allowed by default', () => {
    const result = hasPermissionsToUseTool({
      mode: 'default',
      rules: [],
      tool: readOnlyTool,
      input: {},
    })
    expect(result.behavior).toBe('allow')
  })

  test('destructive tools ask by default', () => {
    const result = hasPermissionsToUseTool({
      mode: 'default',
      rules: [],
      tool: destructiveTool,
      input: { command: 'rm -rf /' },
    })
    expect(result.behavior).toBe('ask')
  })

  test('plan mode allows reads, denies writes', () => {
    const readResult = hasPermissionsToUseTool({
      mode: 'plan',
      rules: [],
      tool: readOnlyTool,
      input: {},
    })
    expect(readResult.behavior).toBe('allow')

    const writeResult = hasPermissionsToUseTool({
      mode: 'plan',
      rules: [],
      tool: destructiveTool,
      input: {},
    })
    expect(writeResult.behavior).toBe('deny')
  })
})
