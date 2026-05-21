import { describe, test, expect, mock, beforeEach } from 'bun:test'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// --- Mocks ---

const mockStreamEvents: BetaRawMessageStreamEvent[] = []
let mockStreamError: Error | null = null

async function* fakeStream(): AsyncGenerator<BetaRawMessageStreamEvent> {
  if (mockStreamError) throw mockStreamError
  for (const evt of mockStreamEvents) {
    yield evt
  }
}

// @ts-expect-error - bun:test mock type is opaque in strict mode
mock.module('../services/api/claude.js', () => ({
  streamClaudeAPI: () => fakeStream(),
}))

// @ts-expect-error
mock.module('../context.js', () => ({
  getSystemContext: () => Promise.resolve('Mock system context.'),
}))

// @ts-expect-error
mock.module('../utils/model/model.js', () => ({
  resolveModel: () => 'claude-sonnet-4-20250514',
  getMaxTokens: () => 100000,
}))

// @ts-expect-error
mock.module('../bootstrap/state.js', () => ({
  getCwd: () => '/test/cwd',
}))

// @ts-expect-error
mock.module('../utils/settings/settings.js', () => ({
  getPermissionMode: () => 'default',
}))

// @ts-expect-error
mock.module('../services/permission/permissionManager.js', () => ({
  requestPermission: () => Promise.resolve(true),
  setPermissionMode: () => {},
  getPermissionMode: () => 'default',
}))

// @ts-expect-error
mock.module('../services/config/configManager.js', () => ({
  loadConfig: () => ({ maxTurns: 50 }),
}))

// @ts-expect-error
mock.module('../services/toolResultStorage.js', () => ({
  persistLargeToolResult: (content: string) => content,
}))

// --- Tests ---

import { query } from '../query.js'

function textEvent(delta: string): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  } as BetaRawMessageStreamEvent
}

function textDelta(text: string): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text },
  } as BetaRawMessageStreamEvent
}

function messageDelta(
  inputTokens: number,
  outputTokens: number,
): BetaRawMessageStreamEvent {
  return {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: outputTokens, input_tokens: inputTokens },
  } as BetaRawMessageStreamEvent
}

function toolUseBlock(id: string, name: string): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'tool_use',
      id,
      name,
      input: {},
    },
  } as BetaRawMessageStreamEvent
}

function toolInputDelta(partial: string): BetaRawMessageStreamEvent {
  return {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: partial },
  } as BetaRawMessageStreamEvent
}

describe('query()', () => {
  beforeEach(() => {
    mockStreamEvents.length = 0
    mockStreamError = null
  })

  test('completes immediately with empty conversation', async () => {
    mockStreamEvents.push(
      textEvent(''),
      textDelta('Hello!'),
      messageDelta(10, 5),
    )

    const messages: Array<{ role: string; content: string }> = []
    const gen = query('You are a helpful assistant.', messages as any, [])

    const events: any[] = []
    for await (const evt of gen) {
      events.push(evt)
    }

    const types = events.map(e => e.type)
    expect(types).toContain('text_delta')
    expect(types).toContain('usage')
    expect(types).toContain('terminal')

    const terminal = events.find(e => e.type === 'terminal')
    expect(terminal?.reason).toBe('completed')
  })

  test('yields text_delta events during streaming', async () => {
    mockStreamEvents.push(
      textEvent(''),
      textDelta('Hello, '),
      textDelta('world!'),
      messageDelta(10, 8),
    )

    const messages: Array<{ role: string; content: string }> = []
    const gen = query('System', messages as any, [])

    const textParts: string[] = []
    for await (const evt of gen) {
      if (evt.type === 'text_delta') {
        textParts.push(evt.text)
      }
    }

    expect(textParts.join('')).toBe('Hello, world!')
  })

  test('yields usage event after streaming', async () => {
    mockStreamEvents.push(textEvent(''), textDelta('Hi'), messageDelta(50, 25))

    const messages: Array<{ role: string; content: string }> = []
    const gen = query('System', messages as any, [])

    let usage: any = null
    for await (const evt of gen) {
      if (evt.type === 'usage') {
        usage = evt
      }
    }

    expect(usage).toBeDefined()
    expect(usage.totalInputTokens).toBe(50)
    expect(usage.totalOutputTokens).toBe(25)
  })

  test('handles tool_use blocks and yields tool_start events', async () => {
    mockStreamEvents.push(
      textEvent(''),
      textDelta('Let me search.'),
      toolUseBlock('toolu_001', 'Grep'),
      toolInputDelta('{"pattern": "foo"}'),
      messageDelta(30, 15),
    )

    const GrepTool = makeMockTool('Grep', true, false)
    const messages: Array<{ role: string; content: string }> = []
    const gen = query('System', messages as any, [GrepTool])

    const toolStarts: any[] = []
    for await (const evt of gen) {
      if (evt.type === 'tool_start') {
        toolStarts.push(evt)
      }
      if (evt.type === 'tool_result') {
        break
      }
    }

    expect(toolStarts.length).toBe(1)
    expect(toolStarts[0].name).toBe('Grep')
    expect(toolStarts[0].id).toBe('toolu_001')
  })

  test('push assistant message to messages array', async () => {
    mockStreamEvents.push(
      textEvent(''),
      textDelta('Hello!'),
      messageDelta(5, 5),
    )

    const messages: any[] = []
    const gen = query('System', messages, [])
    for await (const _ of gen) {
      // consume
    }

    expect(messages.length).toBe(1)
    expect(messages[0].role).toBe('assistant')
  })

  test('respects maxTurns limit', async () => {
    // Generate responses with tool_use to trigger multiple turns
    mockStreamEvents.push(
      textEvent(''),
      textDelta('Turn '),
      toolUseBlock('toolu_001', 'Grep'),
      toolInputDelta('{}'),
      messageDelta(10, 10),
    )

    const GrepTool = makeMockTool('Grep', true, false)
    const messages: any[] = []

    // maxTurns=1 should stop after first turn (user msg + tool result = 2 turns)
    // Actually with maxTurns=1, after the first user message + tool result,
    // the next turn will exceed maxTurns=1
    const gen = query('System', messages, [GrepTool], {
      model: 'test',
      maxTurns: 5,
    })
    let terminal: any = null
    for await (const evt of gen) {
      if (evt.type === 'terminal') {
        terminal = evt
      }
    }

    // maxTurns=5: mock keeps returning tool_use, so loop hits the limit
    expect(terminal).toBeDefined()
    expect(terminal.reason).toBe('max_turns')
  })

  test('aborts cleanly when abortSignal is triggered', async () => {
    mockStreamEvents.push(
      textEvent(''),
      textDelta('Partial text'),
      messageDelta(10, 5),
    )

    const abortController = new AbortController()
    const messages: any[] = []
    const gen = query('System', messages, [], {
      abortSignal: abortController.signal,
    })

    const reader = (async () => {
      const events: any[] = []
      for await (const evt of gen) {
        events.push(evt)
      }
      return events
    })()

    abortController.abort()
    const events = await reader

    const types = events.map(e => e.type)
    expect(types).toContain('terminal')
  })

  test('returns model_error terminal on API error', async () => {
    mockStreamError = new Error('API connection failed')

    const messages: any[] = []
    const gen = query('System', messages, [])

    const terminal = await collectUntilTerminal(gen)
    expect(terminal?.reason).toBe('model_error')
    expect(terminal?.error).toContain('API connection failed')
  })
})

// --- Helpers ---

function makeMockTool(
  name: string,
  isReadOnly: boolean,
  isDestructive: boolean,
): any {
  return {
    name,
    description: `Mock ${name}`,
    inputSchema: { type: 'object' as const, properties: {} },
    prompt: `Mock ${name} tool`,
    execute: async () => ({ content: `${name} result`, success: true }),
    isConcurrencySafe: () => isReadOnly,
    isReadOnly: () => isReadOnly,
    isDestructive: () => isDestructive,
    userFacingName: () => name,
  }
}

async function collectUntilTerminal(gen: any): Promise<any> {
  for await (const evt of gen) {
    if (evt.type === 'terminal') return evt
  }
  return null
}
