import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'

import {
  scanLocalTeamMemories,
  writeTeamMemory,
  removeTeamMemory,
  getTeamSyncConfig,
  setTeamSyncConfig,
  getTeamMemoryForPrompt,
} from '../teamMemorySync.js'

describe('setTeamSyncConfig', () => {
  test('updates team sync config', () => {
    setTeamSyncConfig({ enabled: true, repoSlug: 'test/repo' })
    const config = getTeamSyncConfig()
    expect(config.enabled).toBe(true)
    expect(config.repoSlug).toBe('test/repo')
    setTeamSyncConfig({ enabled: false })
  })
})

describe('writeTeamMemory and scanLocalTeamMemories', () => {
  test('writes and scans team memory files', () => {
    const testKey = 'test-entry-' + Date.now()
    writeTeamMemory(testKey, '# Test Team Memory\nSome content')

    const entries = scanLocalTeamMemories()
    const found = entries.find(e => e.key === testKey)
    expect(found).not.toBe(undefined)
    expect(found?.content).toContain('Some content')

    removeTeamMemory(testKey)
  })
})

describe('removeTeamMemory', () => {
  test('removes a team memory file', () => {
    const testKey = 'test-remove-' + Date.now()
    writeTeamMemory(testKey, 'temporary')

    removeTeamMemory(testKey)

    const entries = scanLocalTeamMemories()
    const found = entries.find(e => e.key === testKey)
    expect(found).toBe(undefined)
  })
})

describe('getTeamMemoryForPrompt', () => {
  test('returns empty string when no team memories', () => {
    const result = getTeamMemoryForPrompt()
    expect(typeof result).toBe('string')
  })
})
