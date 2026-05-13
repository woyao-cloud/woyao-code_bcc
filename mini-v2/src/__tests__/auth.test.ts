import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { getAPIKey, hasAPIKey } from '../utils/auth.js'

const OLD_ENV = { ...process.env }

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.CLAUDE_API_KEY
  delete process.env.OPENAI_API_KEY
  delete process.env.CLAUDE_CODE_USE_OPENAI
})

afterEach(() => {
  process.env = { ...OLD_ENV }
})

describe('getAPIKey', () => {
  test('returns ANTHROPIC_API_KEY when set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    expect(getAPIKey()).toBe('sk-ant-test')
  })

  test('returns CLAUDE_API_KEY as fallback', () => {
    process.env.CLAUDE_API_KEY = 'sk-ant-fallback'
    expect(getAPIKey()).toBe('sk-ant-fallback')
  })

  test('prefers ANTHROPIC_API_KEY over CLAUDE_API_KEY', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-primary'
    process.env.CLAUDE_API_KEY = 'sk-ant-secondary'
    expect(getAPIKey()).toBe('sk-ant-primary')
  })

  test('returns OPENAI_API_KEY when CLAUDE_CODE_USE_OPENAI is set', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_API_KEY = 'sk-openai-test'
    expect(getAPIKey()).toBe('sk-openai-test')
  })

  test('returns Anthropic fallback when OpenAI mode but no OpenAI key', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    expect(getAPIKey()).toBe('sk-ant-test')
  })

  test('returns OPENAI_API_KEY when only it is set', () => {
    process.env.OPENAI_API_KEY = 'sk-openai-only'
    expect(getAPIKey()).toBe('sk-openai-only')
  })

  test('returns undefined when no keys set', () => {
    expect(getAPIKey()).toBeUndefined()
  })
})

describe('hasAPIKey', () => {
  test('returns true when key is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
    expect(hasAPIKey()).toBe(true)
  })

  test('returns false when no key is set', () => {
    expect(hasAPIKey()).toBe(false)
  })

  test('returns false for empty key', () => {
    process.env.ANTHROPIC_API_KEY = ''
    expect(hasAPIKey()).toBe(false)
  })
})
