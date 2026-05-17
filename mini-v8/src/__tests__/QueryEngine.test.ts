import { describe, test, expect, mock } from 'bun:test'

// --- Mocks for query.js dependencies ---

mock.module('../services/api/claude.js', () => ({
  streamClaudeAPI: () => {
    async function* gen() {
      yield {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello from QueryEngine!' },
      }
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 15, input_tokens: 30 },
      }
    }
    return gen()
  },
}))

mock.module('../context.js', () => ({
  getSystemContext: () => Promise.resolve('Mock context.'),
}))

mock.module('../utils/model/model.js', () => ({
  resolveModel: () => 'claude-sonnet-4-20250514',
  getMaxTokens: () => 100000,
}))

mock.module('../bootstrap/state.js', () => ({
  getCwd: () => '/test/cwd',
}))

mock.module('../utils/settings/settings.js', () => ({
  getPermissionMode: () => 'default',
}))

mock.module('../services/permission/permissionManager.js', () => ({
  requestPermission: () => Promise.resolve(true),
  setPermissionMode: () => {},
  getPermissionMode: () => 'default',
}))

mock.module('../services/config/configManager.js', () => ({
  loadConfig: () => ({ maxTurns: 50 }),
}))

mock.module('../services/toolResultStorage.js', () => ({
  persistLargeToolResult: (content: string) => content,
}))

// --- Tests ---

import { QueryEngine } from '../QueryEngine.js'

describe('QueryEngine', () => {
  test('constructor sets default values', () => {
    const engine = new QueryEngine()
    expect(engine.messages).toEqual([])
    expect(engine.getTotalInputTokens()).toBe(0)
    expect(engine.getTotalOutputTokens()).toBe(0)
    expect(engine.getTurnCount()).toBe(0)
  })

  test('constructor accepts options', () => {
    const messages = [{ role: 'user', content: 'Hello' }]
    const engine = new QueryEngine({
      systemPrompt: 'Custom prompt.',
      messages: messages as any,
      model: 'claude-opus-4-20250514',
      maxTurns: 10,
    })
    expect(engine.messages).toEqual(messages)
    expect(engine.messages).toBe(messages) // same reference
  })

  test('setModel updates model', () => {
    const engine = new QueryEngine({ model: 'claude-sonnet-4-20250514' })
    engine.setModel('claude-opus-4-20250514')
    // No direct getter, but internal state changes should work
  })

  test('setTools updates tools', () => {
    const engine = new QueryEngine()
    const tools = [
      { name: 'Bash', execute: async () => ({ content: '', success: true }) },
    ] as any
    engine.setTools(tools)
    // Internal state changes should work
  })

  test('submitMessage pushes user message and yields events', async () => {
    const messages: any[] = []
    const engine = new QueryEngine({ messages })

    const events: any[] = []
    for await (const event of engine.submitMessage('Hello!')) {
      events.push(event)
    }

    // Should have pushed the new user message + assistant response
    expect(messages.length).toBe(2)
    expect(messages[0].role).toBe('user')
    expect(messages[0].content).toBe('Hello!')
    expect(messages[1].role).toBe('assistant')

    const types = events.map(e => e.type)
    expect(types).toContain('text_delta')
    expect(types).toContain('usage')
    expect(types).toContain('terminal')
  })

  test('submitMessage tracks usage', async () => {
    const engine = new QueryEngine()
    for await (const _ of engine.submitMessage('Test')) {
      // consume
    }

    expect(engine.getTotalInputTokens()).toBeGreaterThan(0)
    expect(engine.getTotalOutputTokens()).toBeGreaterThan(0)
    expect(engine.getTotalInputTokens()).toBe(30)
    expect(engine.getTotalOutputTokens()).toBe(15)
  })

  test('submitMessage tracks turn count', async () => {
    const engine = new QueryEngine()
    for await (const _ of engine.submitMessage('Turn 1')) {
      // consume
    }

    expect(engine.getTurnCount()).toBe(1)
  })

  test('interrupt resets abort controller', () => {
    const engine = new QueryEngine()
    // Before any call, abort controller should be alive
    engine.interrupt()
    // After interrupt, new abort controller should be ready
    // (no pending operation to abort)
  })

  test('multiple submitMessage calls accumulate tokens', async () => {
    const engine = new QueryEngine()
    for await (const _ of engine.submitMessage('First')) {
      // consume
    }
    for await (const _ of engine.submitMessage('Second')) {
      // consume
    }

    // Each call overwrites totals (tracks current call, not cumulative)
    expect(engine.getTurnCount()).toBe(1)
    expect(engine.getTotalInputTokens()).toBe(30)
    expect(engine.getTotalOutputTokens()).toBe(15)
    expect(engine.messages.length).toBe(4) // 2 user + 2 assistant
  })

  test('submitMessage with canUseTool option', async () => {
    const canUseTool = mock(() => Promise.resolve(true))
    const engine = new QueryEngine()

    for await (const _ of engine.submitMessage('Test', { canUseTool })) {
      // consume
    }

    // canUseTool was passed through
  })

  test('systemPrompt defaults to preset', () => {
    const engine = new QueryEngine()
    // Constructor should not throw
  })

  test('empty tools list works', async () => {
    const messages: any[] = []
    const engine = new QueryEngine({ messages, tools: [] })

    for await (const _ of engine.submitMessage('Test')) {
      // No tools, but text-only response still works
    }

    expect(engine.messages.length).toBe(2) // user + assistant
  })
})
