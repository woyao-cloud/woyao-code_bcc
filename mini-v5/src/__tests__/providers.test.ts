import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
  isOpenAIProvider,
} from '../utils/model/providers.js'

const OLD_ENV = { ...process.env }

beforeEach(() => {
  delete process.env.CLAUDE_CODE_USE_OPENAI
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_AUTH_TOKEN
  delete process.env.ANTHROPIC_BASE_URL
  delete process.env.OPENAI_API_KEY
})

afterEach(() => {
  process.env = { ...OLD_ENV }
})

describe('getAPIProvider', () => {
  test('returns firstParty by default', () => {
    expect(getAPIProvider()).toBe('firstParty')
  })

  test('returns openai when CLAUDE_CODE_USE_OPENAI=1', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    expect(getAPIProvider()).toBe('openai')
  })

  test('returns openai when only OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test'
    expect(getAPIProvider()).toBe('openai')
  })

  test('returns firstParty when both keys are set but no flag', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant'
    process.env.OPENAI_API_KEY = 'sk-openai'
    expect(getAPIProvider()).toBe('firstParty')
  })

  test('returns firstParty when ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN are set', () => {
    process.env.ANTHROPIC_BASE_URL = 'http://localhost:11434'
    process.env.ANTHROPIC_AUTH_TOKEN = 'test'
    expect(getAPIProvider()).toBe('firstParty')
  })

  test('returns firstParty when ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY are set', () => {
    process.env.ANTHROPIC_BASE_URL = 'http://localhost:11434'
    process.env.ANTHROPIC_API_KEY = 'sk-ant'
    expect(getAPIProvider()).toBe('firstParty')
  })

  test('CLAUDE_CODE_USE_OPENAI overrides ANTHROPIC_BASE_URL', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.ANTHROPIC_BASE_URL = 'http://localhost:11434'
    process.env.ANTHROPIC_AUTH_TOKEN = 'test'
    expect(getAPIProvider()).toBe('openai')
  })
})

describe('isFirstPartyAnthropicBaseUrl', () => {
  test('returns true when firstParty', () => {
    expect(isFirstPartyAnthropicBaseUrl()).toBe(true)
  })

  test('returns false when openai', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    expect(isFirstPartyAnthropicBaseUrl()).toBe(false)
  })
})

describe('isOpenAIProvider', () => {
  test('returns false by default', () => {
    expect(isOpenAIProvider()).toBe(false)
  })

  test('returns true when openai is active', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    expect(isOpenAIProvider()).toBe(true)
  })
})
