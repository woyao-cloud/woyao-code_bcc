import { describe, expect, test, beforeEach } from 'bun:test'
import {
  needsPermission,
  setPermissionMode,
  getPermissionMode,
} from '../services/permission/permissionManager.js'

beforeEach(() => {
  setPermissionMode('default')
})

describe('permissionManager', () => {
  test('default mode requires permission for Bash', () => {
    expect(needsPermission('Bash')).toBe(true)
  })

  test('default mode requires permission for Write', () => {
    expect(needsPermission('Write')).toBe(true)
  })

  test('default mode requires permission for Edit', () => {
    expect(needsPermission('Edit')).toBe(true)
  })

  test('default mode requires permission for ApplyPatch', () => {
    expect(needsPermission('ApplyPatch')).toBe(true)
  })

  test('default mode does not require permission for Read', () => {
    expect(needsPermission('Read')).toBe(false)
  })

  test('default mode does not require permission for Grep', () => {
    expect(needsPermission('Grep')).toBe(false)
  })

  test('bypassPermissions mode skips all permissions', () => {
    setPermissionMode('bypassPermissions')
    expect(needsPermission('Bash')).toBe(false)
    expect(needsPermission('Write')).toBe(false)
  })

  test('setPermissionMode updates mode', () => {
    setPermissionMode('bypassPermissions')
    expect(getPermissionMode()).toBe('bypassPermissions')
  })

  test('default permission mode is default', () => {
    expect(getPermissionMode()).toBe('default')
  })
})
