import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mini-v8-perm-loader-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

// Must import after setting dir in beforeEach, but we'll set dir before each test
import {
  loadPermissionMode,
  savePermissionMode,
  loadPermissionRules,
  addPermissionRule,
  removePermissionRule,
  clearPermissionRules,
  setPermissionsConfigDir,
} from '../services/permission/permissionsLoader.js'

describe('permissionsLoader', () => {
  beforeEach(() => {
    setPermissionsConfigDir(tempDir)
  })

  test('loadPermissionMode returns default when no config', () => {
    expect(loadPermissionMode()).toBe('default')
  })

  test('savePermissionMode and loadPermissionMode round-trip', () => {
    savePermissionMode('acceptEdits')
    expect(loadPermissionMode()).toBe('acceptEdits')

    savePermissionMode('bypassPermissions')
    expect(loadPermissionMode()).toBe('bypassPermissions')

    savePermissionMode('plan')
    expect(loadPermissionMode()).toBe('plan')
  })

  test('loadPermissionRules returns empty when no rules', () => {
    expect(loadPermissionRules()).toEqual([])
  })

  test('addPermissionRule persists a rule', () => {
    const ok = addPermissionRule('allow: Bash(git *)')
    expect(ok).toBe(true)

    const rules = loadPermissionRules()
    expect(rules.length).toBe(1)
    expect(rules[0].behavior).toBe('allow')
    expect(rules[0].toolName).toBe('Bash')
    expect(rules[0].pattern).toBe('git *')
  })

  test('addPermissionRule rejects invalid rule', () => {
    const ok = addPermissionRule('invalid rule')
    expect(ok).toBe(false)
    expect(loadPermissionRules().length).toBe(0)
  })

  test('removePermissionRule removes by index', () => {
    addPermissionRule('allow: Bash(git *)')
    addPermissionRule('deny: Write(config/*)')
    expect(loadPermissionRules().length).toBe(2)

    const ok = removePermissionRule(0)
    expect(ok).toBe(true)
    const rules = loadPermissionRules()
    expect(rules.length).toBe(1)
    expect(rules[0].behavior).toBe('deny')
  })

  test('removePermissionRule returns false for invalid index', () => {
    expect(removePermissionRule(0)).toBe(false)
    expect(removePermissionRule(-1)).toBe(false)
  })

  test('clearPermissionRules removes all rules', () => {
    addPermissionRule('allow: Bash(git *)')
    addPermissionRule('deny: Write(/etc/*)')
    expect(loadPermissionRules().length).toBe(2)

    clearPermissionRules()
    expect(loadPermissionRules().length).toBe(0)
  })

  test('multiple rules round-trip correctly', () => {
    addPermissionRule('allow: Bash(git *)')
    addPermissionRule('deny: Write(/etc/*)')
    addPermissionRule('ask: WebFetch(sensitive*)')

    const rules = loadPermissionRules()
    expect(rules.length).toBe(3)
    expect(rules[0].behavior).toBe('allow')
    expect(rules[1].behavior).toBe('deny')
    expect(rules[2].behavior).toBe('ask')
  })

  test('mode persists across saves', () => {
    savePermissionMode('bypassPermissions')
    expect(loadPermissionMode()).toBe('bypassPermissions')

    savePermissionMode('default')
    expect(loadPermissionMode()).toBe('default')
  })
})
