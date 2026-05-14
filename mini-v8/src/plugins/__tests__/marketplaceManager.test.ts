import { describe, test, expect } from 'bun:test'

import {
  loadKnownMarketplaces,
  removeMarketplace,
  searchMarketplacePlugins,
  getAllMarketplacePlugins,
} from '../../plugins/marketplaceManager.js'

describe('loadKnownMarketplaces', () => {
  test('returns a record object', () => {
    const mps = loadKnownMarketplaces()
    expect(typeof mps).toBe('object')
  })
})

describe('removeMarketplace', () => {
  test('returns false for non-existent marketplace', () => {
    const result = removeMarketplace('nonexistent-' + Date.now())
    expect(result).toBe(false)
  })
})

describe('searchMarketplacePlugins', () => {
  test('filters plugins by name', () => {
    const results = searchMarketplacePlugins(
      {
        name: 'test',
        version: '1.0.0',
        plugins: [
          {
            name: 'hello-world',
            version: '1.0.0',
            description: 'A hello plugin',
            repository: 'https://github.com/test/hello',
          },
          {
            name: 'goodbye-world',
            version: '1.0.0',
            description: 'A goodbye plugin',
            repository: 'https://github.com/test/goodbye',
          },
        ],
      },
      'hello',
    )
    expect(results.length).toBe(1)
    expect(results[0]?.name).toBe('hello-world')
  })

  test('filters plugins by description', () => {
    const results = searchMarketplacePlugins(
      {
        name: 'test',
        version: '1.0.0',
        plugins: [
          {
            name: 'alpha',
            version: '1.0.0',
            description: 'A testing tool',
            repository: 'https://github.com/test/alpha',
          },
          {
            name: 'beta',
            version: '1.0.0',
            description: 'A deployment tool',
            repository: 'https://github.com/test/beta',
          },
        ],
      },
      'deployment',
    )
    expect(results.length).toBe(1)
    expect(results[0]?.name).toBe('beta')
  })

  test('returns empty for no matches', () => {
    const results = searchMarketplacePlugins(
      {
        name: 'test',
        version: '1.0.0',
        plugins: [
          {
            name: 'plugin-a',
            version: '1.0.0',
            description: 'A',
            repository: 'https://github.com/test/a',
          },
        ],
      },
      'zzzznonexistent',
    )
    expect(results.length).toBe(0)
  })
})

describe('getAllMarketplacePlugins', () => {
  test('returns all plugins', () => {
    const results = getAllMarketplacePlugins({
      name: 'test',
      version: '1.0.0',
      plugins: [
        {
          name: 'plugin-a',
          version: '1.0.0',
          description: 'A',
          repository: 'https://github.com/test/a',
        },
        {
          name: 'plugin-b',
          version: '1.0.0',
          description: 'B',
          repository: 'https://github.com/test/b',
        },
      ],
    })
    expect(results.length).toBe(2)
  })
})
