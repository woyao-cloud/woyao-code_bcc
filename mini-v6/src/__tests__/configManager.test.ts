import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  loadConfig,
  saveConfig,
  updateConfig,
  clearConfigCache,
  setConfigDir,
} from '../services/config/configManager.js'
import type { AppConfig } from '../services/config/configManager.js'

let tempDir: string

describe('configManager', () => {
  beforeEach(() => {
    // Create a unique temp directory per test for complete isolation
    tempDir = mkdtempSync(join(tmpdir(), 'config-test-'))
    setConfigDir(tempDir)
  })

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('loadConfig returns empty object when no config', () => {
    const config = loadConfig()
    expect(config).toBeDefined()
    expect(typeof config).toBe('object')
  })

  test('saveConfig persists config', () => {
    const config: AppConfig = { model: 'test-model', maxTurns: 5 }
    saveConfig(config)
    const loaded = loadConfig()
    expect(loaded.model).toBe('test-model')
    expect(loaded.maxTurns).toBe(5)
  })

  test('updateConfig merges updates', () => {
    saveConfig({ model: 'old-model', theme: 'dark' })
    const updated = updateConfig({ model: 'new-model' })
    expect(updated.model).toBe('new-model')
    expect(updated.theme).toBe('dark')
  })

  test('updateConfig adds new fields', () => {
    saveConfig({ model: 'sonnet' })
    const updated = updateConfig({ maxTurns: 10 })
    expect(updated.model).toBe('sonnet')
    expect(updated.maxTurns).toBe(10)
  })

  test('clearConfigCache forces re-read', () => {
    saveConfig({ model: 'cached' })
    expect(loadConfig().model).toBe('cached')
    clearConfigCache()
    expect(loadConfig().model).toBe('cached')
  })

  test('permissionMode defaults', () => {
    saveConfig({ permissionMode: 'bypassPermissions' })
    expect(loadConfig().permissionMode).toBe('bypassPermissions')
  })

  test('autoCompact flag', () => {
    saveConfig({ autoCompact: true })
    expect(loadConfig().autoCompact).toBe(true)
  })

  test('theme values', () => {
    saveConfig({ theme: 'light' })
    expect(loadConfig().theme).toBe('light')
  })

  test('empty updateConfig does not change values', () => {
    saveConfig({ model: 'stable', theme: 'dark' })
    const updated = updateConfig({})
    expect(updated.model).toBe('stable')
    expect(updated.theme).toBe('dark')
  })
})
