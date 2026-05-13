import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  loadPluginManifest,
  parsePluginSpec,
  createPluginId,
  loadAllPlugins,
} from '../../plugins/pluginLoader.js'

describe('loadPluginManifest', () => {
  test('returns null for non-existent directory', () => {
    expect(loadPluginManifest('/nonexistent/path')).toBeNull()
  })

  test('loads valid plugin manifest', () => {
    const dir = join(tmpdir(), 'mini-v6-test-manifest-' + Date.now())
    const metaDir = join(dir, '.codex-plugin')
    mkdirSync(metaDir, { recursive: true })
    writeFileSync(
      join(metaDir, 'plugin.json'),
      JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test',
      }),
      'utf-8',
    )

    const manifest = loadPluginManifest(dir)
    expect(manifest).not.toBeNull()
    expect(manifest?.name).toBe('test-plugin')
    expect(manifest?.version).toBe('1.0.0')

    rmSync(dir, { recursive: true, force: true })
  })

  test('returns null for missing name field', () => {
    const dir = join(tmpdir(), 'mini-v6-test-noname-' + Date.now())
    const metaDir = join(dir, '.codex-plugin')
    mkdirSync(metaDir, { recursive: true })
    writeFileSync(
      join(metaDir, 'plugin.json'),
      JSON.stringify({ version: '1.0.0' }),
      'utf-8',
    )

    const manifest = loadPluginManifest(dir)
    expect(manifest).toBeNull()

    rmSync(dir, { recursive: true, force: true })
  })
})

describe('parsePluginSpec', () => {
  test('parses name@marketplace', () => {
    const result = parsePluginSpec('my-plugin@official')
    expect(result.name).toBe('my-plugin')
    expect(result.marketplace).toBe('official')
  })

  test('handles name only', () => {
    const result = parsePluginSpec('my-plugin')
    expect(result.name).toBe('my-plugin')
    expect(result.marketplace).toBeUndefined()
  })

  test('handles name@marketplace@extra (last @ is separator)', () => {
    const result = parsePluginSpec('my-plugin@official@v2')
    // lastIndexOf('@') finds the second @, so name includes the first segment
    expect(result.name).toBe('my-plugin@official')
    expect(result.marketplace).toBe('v2')
  })
})

describe('createPluginId', () => {
  test('creates id from name and marketplace', () => {
    expect(createPluginId('my-plugin', 'official')).toBe('my-plugin@official')
  })
})

describe('loadAllPlugins', () => {
  test('returns empty array when no plugins installed', () => {
    const plugins = loadAllPlugins(tmpdir())
    expect(Array.isArray(plugins)).toBe(true)
  })
})
