import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  resolveModel,
  getMaxTokens,
  DEFAULT_MODEL,
  MODELS,
} from '../utils/model/model.js'

const OLD_ENV = { ...process.env }

beforeEach(() => {
  delete process.env.ANTHROPIC_MODEL
  delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
})

afterEach(() => {
  process.env = { ...OLD_ENV }
})

describe('resolveModel', () => {
  test('returns DEFAULT_MODEL when no env vars set', () => {
    expect(resolveModel()).toBe(DEFAULT_MODEL)
  })

  test('returns explicit override', () => {
    expect(resolveModel('claude-opus-4-20250514')).toBe(
      'claude-opus-4-20250514',
    )
  })

  test('returns ANTHROPIC_MODEL from env', () => {
    process.env.ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022'
    expect(resolveModel()).toBe('claude-3-5-sonnet-20241022')
  })

  test('returns ANTHROPIC_DEFAULT_SONNET_MODEL as fallback', () => {
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'claude-3-5-haiku-20241022'
    expect(resolveModel()).toBe('claude-3-5-haiku-20241022')
  })

  test('parses model aliases', () => {
    process.env.ANTHROPIC_MODEL = 'sonnet'
    expect(resolveModel()).toBe('claude-sonnet-4-20250514')
  })

  test('parses opus alias', () => {
    process.env.ANTHROPIC_MODEL = 'opus'
    expect(resolveModel()).toBe('claude-opus-4-20250514')
  })

  test('returns unknown model as-is', () => {
    expect(resolveModel('unknown-model-123')).toBe('unknown-model-123')
  })
})

describe('getMaxTokens', () => {
  test('returns correct max tokens for known model', () => {
    expect(getMaxTokens('claude-sonnet-4-20250514')).toBe(128000)
  })

  test('returns correct max tokens for opus', () => {
    expect(getMaxTokens('claude-opus-4-20250514')).toBe(200000)
  })

  test('returns default 32000 for unknown model', () => {
    expect(getMaxTokens('unknown')).toBe(32000)
  })
})

describe('MODELS', () => {
  test('has expected model entries', () => {
    expect(Object.keys(MODELS).length).toBeGreaterThanOrEqual(4)
    expect(MODELS[DEFAULT_MODEL]).toBeDefined()
  })

  test('each model has maxTokens and displayName', () => {
    for (const [name, info] of Object.entries(MODELS)) {
      expect(typeof info.maxTokens).toBe('number')
      expect(typeof info.displayName).toBe('string')
      expect(info.maxTokens).toBeGreaterThan(0)
    }
  })
})

describe('DEFAULT_MODEL', () => {
  test('is a non-empty string', () => {
    expect(typeof DEFAULT_MODEL).toBe('string')
    expect(DEFAULT_MODEL.length).toBeGreaterThan(0)
  })

  test('exists in MODELS', () => {
    expect(MODELS[DEFAULT_MODEL]).toBeDefined()
  })
})
