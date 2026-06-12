import { describe, expect, test } from 'bun:test'
import { CtxInspectTool } from '../tools/builtin/CtxInspectTool/CtxInspectTool.js'
import type { ToolUseContext } from '../Tool.js'
import type { Message } from '../types/message.js'

function makeUserMsg(role: string, content: string, uuid: string): Message {
  return {
    type: 'user',
    message: { role: 'user', content },
    uuid,
    timestamp: '',
    sessionId: 's1',
  } as Message
}

function makeAssistantMsg(): Message {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Hi there!' }],
      model: 'test',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    uuid: '2',
    timestamp: '',
    sessionId: 's1',
  } as Message
}

describe('CtxInspectTool', () => {
  test('reports empty context properly', async () => {
    const mockCtx: ToolUseContext = {
      toolUse: { type: 'tool_use', id: 'test', name: 'CtxInspect', input: {} },
      permissionMode: 'default',
      toolPermissionContext: {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        isBypassPermissionsModeAvailable: false,
      },
      cwd: '/test',
      abortSignal: new AbortController().signal,
      messages: [],
      isInteractive: false,
    }
    const result = await CtxInspectTool.execute(mockCtx, {})
    expect(result.success).toBe(true)
    expect(result.content).toContain('No messages')
  })

  test('reports context with messages', async () => {
    const mockCtx: ToolUseContext = {
      toolUse: { type: 'tool_use', id: 'test', name: 'CtxInspect', input: {} },
      permissionMode: 'default',
      toolPermissionContext: {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        isBypassPermissionsModeAvailable: false,
      },
      cwd: '/test',
      abortSignal: new AbortController().signal,
      messages: [makeUserMsg('user', 'Hello', '1'), makeAssistantMsg()],
      isInteractive: false,
    }
    const result = await CtxInspectTool.execute(mockCtx, { detail: 'full' })
    expect(result.success).toBe(true)
    expect(result.content).toContain('Total messages: 2')
    expect(result.content).toContain('user')
    expect(result.content).toContain('assistant')
    expect(result.content).toContain('Estimated tokens')
  })

  test('returns metadata with token info', async () => {
    const mockCtx: ToolUseContext = {
      toolUse: { type: 'tool_use', id: 'test', name: 'CtxInspect', input: {} },
      permissionMode: 'default',
      toolPermissionContext: {
        mode: 'default',
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: {},
        alwaysDenyRules: {},
        isBypassPermissionsModeAvailable: false,
      },
      cwd: '/test',
      abortSignal: new AbortController().signal,
      messages: [makeUserMsg('user', 'Test', '1')],
      isInteractive: false,
    }
    const result = await CtxInspectTool.execute(mockCtx, {})
    expect(result.metadata).toBeDefined()
    expect(result.metadata!.totalMessages).toBe(1)
  })

  test('has correct name', () => {
    expect(CtxInspectTool.name).toBe('CtxInspect')
    expect(CtxInspectTool.description).toBeTruthy()
    expect(CtxInspectTool.inputSchema).toBeDefined()
  })
})
