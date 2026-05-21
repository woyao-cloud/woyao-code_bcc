import { describe, test, expect, beforeEach } from 'bun:test'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  dispatchCommand,
  registerCommand,
  getCommand,
  getAllCommands,
  clearCommands,
  getHelpText,
  initializeCommands,
} from '../commands/index.js'
import { createConversationBuffers } from '../services/messages/apiProjection.js'
import { parseCLIArgs } from '../cli/args.js'

describe('command registry integration', () => {
  beforeEach(() => {
    clearCommands()
  })

  test('registerCommand and getCommand', () => {
    registerCommand({
      name: 'test',
      description: 'Test command',
      handler: () => 'test ok',
    })

    const cmd = getCommand('test')
    expect(cmd).toBeDefined()
    expect(cmd?.name).toBe('test')
  })

  test('getAllCommands returns no duplicates', () => {
    registerCommand({
      name: 'test',
      aliases: ['t'],
      description: 'Test',
      handler: () => 'ok',
    })

    const all = getAllCommands()
    expect(all.length).toBe(1)
  })

  test('dispatchCommand routes to correct handler', async () => {
    registerCommand({
      name: 'greet',
      description: 'Greet',
      handler: ctx => `Hello, ${ctx.args}`,
    })

    const ctx = {
      args: '',
      conversation: createConversationBuffers(),
      messages: [],
      cwd: '/test',
    }

    const result = await dispatchCommand('/greet World', ctx)
    expect(result).toBe('Hello, World')
  })

  test('dispatchCommand returns null for unknown command', async () => {
    const ctx = {
      args: '',
      conversation: createConversationBuffers(),
      messages: [],
      cwd: '/test',
    }

    const result = await dispatchCommand('/nonexistent', ctx)
    expect(result).toBeNull()
  })

  test('dispatchCommand returns null for non-command input', async () => {
    const ctx = {
      args: '',
      conversation: createConversationBuffers(),
      messages: [],
      cwd: '/test',
    }

    const result = await dispatchCommand('just some text', ctx)
    expect(result).toBeNull()
  })

  test('exit command returns EXIT signal', async () => {
    registerCommand({
      name: 'exit',
      description: 'Exit',
      handler: () => '__EXIT__',
    })

    const ctx = {
      args: '',
      conversation: createConversationBuffers(),
      messages: [],
      cwd: '/test',
    }

    const result = await dispatchCommand('/exit', ctx)
    expect(result).toBe('__EXIT__')
  })

  test('help command lists registered commands', async () => {
    registerCommand({
      name: 'alpha',
      description: 'First',
      handler: () => 'a',
    })
    registerCommand({
      name: 'beta',
      description: 'Second',
      handler: () => 'b',
    })

    const help = getHelpText()
    expect(help).toContain('alpha')
    expect(help).toContain('beta')
    expect(help).toContain('/alpha')
    expect(help).toContain('/beta')
  })

  test('initializeCommands registers all built-in commands', () => {
    initializeCommands(
      () => {},
      () => ({ maxTurns: 50 }),
      () => [],
      () => [],
    )

    const cmds = getAllCommands()
    const names = new Set(cmds.map(c => c.name))
    expect(names.has('help')).toBe(true)
    expect(names.has('exit')).toBe(true)
    expect(names.has('clear')).toBe(true)
    expect(names.has('model')).toBe(true)
    expect(names.has('compact')).toBe(true)
    expect(names.has('plugin')).toBe(true)
    expect(names.has('skill')).toBe(true)
    expect(names.has('memory')).toBe(true)
    expect(names.has('agent')).toBe(true)
    expect(names.has('mcp')).toBe(true)
    expect(names.has('doctor')).toBe(true)
  })

  test('clear command handler works', async () => {
    initializeCommands(
      () => {},
      () => ({ maxTurns: 50 }),
      () => [],
      () => [],
    )

    const ctx = {
      args: '',
      conversation: createConversationBuffers(),
      messages: [],
      cwd: '/test',
    }

    const result = await dispatchCommand('/clear', ctx)
    expect(result).toBe('Conversation cleared.')
  })

  test('dispatchCommand strip leading slash', async () => {
    registerCommand({
      name: 'test',
      description: 'Test',
      handler: () => 'matched',
    })

    const ctx = {
      args: '',
      conversation: createConversationBuffers(),
      messages: [],
      cwd: '/test',
    }

    expect(await dispatchCommand('/test', ctx)).toBe('matched')
  })
})

describe('parseCLIArgs', () => {
  test('parses prompt args', () => {
    const result = parseCLIArgs(['hello', 'world'])
    expect(result.promptArgs).toEqual(['hello', 'world'])
    expect(result.resumeRequested).toBe(false)
  })

  test('parses --resume flag', () => {
    const result = parseCLIArgs(['--resume'])
    expect(result.resumeRequested).toBe(true)
    expect(result.promptArgs).toEqual([])
  })

  test('parses --resume= with session ID', () => {
    const result = parseCLIArgs(['--resume=abc-123'])
    expect(result.resumeRequested).toBe(true)
    expect(result.resumeSessionId).toBe('abc-123')
    expect(result.promptArgs).toEqual([])
  })

  test('parses mixed resume and prompt args', () => {
    const result = parseCLIArgs(['--resume', 'do', 'something'])
    expect(result.resumeRequested).toBe(true)
    expect(result.promptArgs).toEqual(['do', 'something'])
  })

  test('returns empty args for empty input', () => {
    const result = parseCLIArgs([])
    expect(result.promptArgs).toEqual([])
    expect(result.resumeRequested).toBe(false)
  })
})
