import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  scanLocalTeamMemories,
  writeTeamMemory,
  removeTeamMemory,
  getTeamSyncConfig,
  setTeamSyncConfig,
  getTeamMemoryForPrompt,
  getTeamMemoryForPromptWithOptions,
  setTeamMemoryDir,
} from '../teamMemorySync.js'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mini-v8-team-memory-'))
  setTeamMemoryDir(tempDir)
})

afterEach(() => {
  setTeamMemoryDir(null)
  try {
    rmSync(tempDir, { recursive: true, force: true })
  } catch {}
})

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

  test('selects team memories relevant to the current query', () => {
    writeTeamMemory(
      'frontend-swarm',
      'Landing page design decisions for hero layout and typography.',
    )
    writeTeamMemory(
      'infra-squad',
      'CI build stabilization steps for flaky deployment pipelines.',
    )

    const result = getTeamMemoryForPromptWithOptions({
      query: 'frontend design review',
      limit: 2,
      maxChars: 500,
    })

    expect(result).toContain('frontend-swarm')
    expect(result).toContain('Landing page design decisions')
    expect(result).not.toContain('infra-squad')
  })

  test('truncates large team memory prompt output', () => {
    writeTeamMemory('frontend-swarm', 'x'.repeat(800))

    const result = getTeamMemoryForPromptWithOptions({
      maxChars: 160,
    })

    expect(result.length).toBeLessThanOrEqual(160)
    expect(result).toContain('Team memory truncated')
  })
})
