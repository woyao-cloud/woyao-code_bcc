#!/usr/bin/env bun
import { getSystemContext } from '../context.js'
import { getTools } from '../tools/tools.js'
import { streamClaudeAPI } from '../services/api/claude.js'
import { getCwd, state } from '../bootstrap/state.js'
import { resolveModel } from '../utils/model/model.js'
import { getAPIKey } from '../utils/auth.js'
import { getPermissionMode } from '../utils/settings/settings.js'
import { logError, logInfo } from '../utils/log.js'
import { logDebug } from '../utils/debug.js'
import type { ContentItem } from '../types/message.js'
import type {
  BetaRawMessageStreamEvent,
  BetaMessageParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Tool, ToolUseContext } from '../Tool.js'
import { createAbortController } from '../utils/abortController.js'
import { isOpenAIProvider, getAPIProvider } from '../utils/model/providers.js'
import { resetTasks } from '../services/taskStore.js'
import { requestPermission } from '../services/permission/permissionManager.js'
import { isInPlanMode } from '../services/planMode.js'
import { createInterface } from 'readline'
import { stdin, stdout } from 'process'

interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

interface TextBlock {
  type: 'text'
  text: string
}

type ContentBlock = ToolUseBlock | TextBlock

async function main() {
  ;(globalThis as unknown as Record<string, unknown>).MACRO = {
    VERSION: '4.0.0',
    BUILD_TIME: new Date().toISOString(),
  }

  resetTasks()

  const args = process.argv.slice(2)
  const apiKey = getAPIKey()
  const usingOpenAI = isOpenAIProvider()
  if (!apiKey) {
    const keyName = usingOpenAI ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
    process.stderr.write('Error: ' + keyName + ' not set\n')
    process.exit(1)
  }

  // Check if running via pipe
  const isPiped = !process.stdin.isTTY
  const hasArgs = args.length > 0

  if (isPiped || hasArgs) {
    // Pipe/args mode: single prompt
    let prompt = ''
    if (hasArgs) {
      prompt = args.join(' ')
    } else {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
      }
      prompt = Buffer.concat(chunks).toString('utf-8').trim()
    }
    if (!prompt) {
      process.stderr.write('Error: No prompt\n')
      process.exit(1)
    }
    await runConversation(prompt)
  } else {
    // Interactive REPL mode
    await runREPL()
  }
}

async function runREPL() {
  const provider = getAPIProvider()
  const model = resolveModel()
  const cwd = getCwd()
  const tools = getTools()

  process.stderr.write('Claude Code Mini v4.0.0\n')
  process.stderr.write('Provider: ' + provider + ' | Model: ' + model + '\n')
  process.stderr.write('Tools: ' + tools.length + ' | CWD: ' + cwd + '\n')
  process.stderr.write(
    'Type /help for commands, Ctrl+C to cancel, Ctrl+D to exit\n\n',
  )

  const messages: BetaMessageParam[] = []

  while (true) {
    const line = await readLine('> ')
    if (line === null) {
      process.stderr.write('\nGoodbye!\n')
      break
    }

    const trimmed = line.trim()
    if (!trimmed) continue

    // Handle commands
    if (trimmed.startsWith('/')) {
      const cmd = trimmed.slice(1).toLowerCase()
      if (cmd === 'exit' || cmd === 'quit') {
        process.stderr.write('Goodbye!\n')
        break
      }
      if (cmd === 'help') {
        process.stderr.write('Commands: /help, /exit, /clear, /tools, /model\n')
        continue
      }
      if (cmd === 'clear') {
        messages.length = 0
        resetTasks()
        process.stderr.write('Session cleared.\n')
        continue
      }
      if (cmd === 'tools') {
        process.stderr.write(
          'Available: ' + tools.map(t => t.name).join(', ') + '\n',
        )
        continue
      }
      if (cmd === 'model') {
        process.stderr.write('Current: ' + model + '\n')
        continue
      }
      process.stderr.write('Unknown command: ' + trimmed + '\n')
      continue
    }

    // Run conversation turn
    messages.push({ role: 'user', content: trimmed })
    await runConversationTurn(messages)
    process.stderr.write('\n')
  }
}

function readLine(prompt: string): Promise<string | null> {
  return new Promise(resolve => {
    const rl = createInterface({ input: stdin, output: stdout })
    rl.question(prompt, answer => {
      rl.close()
      resolve(answer.trimEnd() || null)
    })
  })
}

async function runConversation(initialPrompt: string) {
  const messages: BetaMessageParam[] = [
    { role: 'user', content: initialPrompt },
  ]
  await runConversationTurn(messages)
}

async function runConversationTurn(messages: BetaMessageParam[]) {
  const cwd = getCwd()
  const systemContext = await getSystemContext()
  const tools = getTools()
  const toolsMap = new Map(tools.map(t => [t.name, t]))
  const model = resolveModel()
  const provider = getAPIProvider()

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace(
    '{context}',
    systemContext,
  )

  let turnCount = 0
  const maxTurns = 25
  let totalInputTokens = 0
  let totalOutputTokens = 0

  while (turnCount < maxTurns) {
    turnCount++
    const contentBlocks: ContentBlock[] = []
    const toolUses: ToolUseBlock[] = []
    let fullText = ''

    try {
      const { signal, clear } = createAbortController(300_000)

      for await (const event of streamClaudeAPI({
        systemPrompt,
        messages,
        tools,
        model,
        signal,
      })) {
        const evt = event as BetaRawMessageStreamEvent

        switch (evt.type) {
          case 'content_block_start': {
            const block = evt.content_block
            if (block.type === 'tool_use') {
              const tu: ToolUseBlock = {
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: {},
              }
              toolUses.push(tu)
              contentBlocks.push(tu)
              process.stderr.write('\n  ' + block.name + '...')
            } else if (block.type === 'text') {
              contentBlocks.push({ type: 'text', text: '' })
            }
            break
          }
          case 'content_block_delta': {
            const delta = evt.delta
            if (delta.type === 'text_delta') {
              const lastBlock = contentBlocks[contentBlocks.length - 1]
              if (lastBlock && lastBlock.type === 'text') {
                lastBlock.text += delta.text
                fullText += delta.text
              }
            } else if (delta.type === 'input_json_delta') {
              const lastTool = toolUses[toolUses.length - 1]
              if (lastTool) {
                lastTool.input = {
                  ...lastTool.input,
                  ...safeJsonMerge(lastTool.input, delta.partial_json),
                }
              }
            }
            break
          }
          case 'message_delta': {
            totalInputTokens += evt.usage?.input_tokens ?? 0
            totalOutputTokens += evt.usage.output_tokens
            break
          }
        }
      }
      clear()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('abort')) {
        logError('Request timed out')
        break
      }
      logError('API error: ' + msg)
      break
    }

    if (fullText) {
      process.stdout.write(fullText + '\n')
    }

    if (toolUses.length === 0) {
      if (turnCount > 1) {
        process.stderr.write(
          '\n  Tokens: ' +
            totalInputTokens +
            ' in / ' +
            totalOutputTokens +
            ' out | Turns: ' +
            turnCount +
            '\n',
        )
      }
      break
    }

    const assistantContent: ContentItem[] = contentBlocks.map(b => {
      if (b.type === 'tool_use')
        return { type: 'tool_use', id: b.id, name: b.name, input: b.input }
      return { type: 'text', text: b.text }
    })
    messages.push({ role: 'assistant', content: assistantContent })

    const toolResults: ContentItem[] = []
    for (const toolUse of toolUses) {
      const tool = toolsMap.get(toolUse.name)
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Unknown tool: ' + toolUse.name,
          is_error: true,
        })
        continue
      }

      // Check permission
      const allowed = await requestPermission({
        toolName: tool.name,
        toolDescription: tool.description,
        input: toolUse.input,
      })

      if (!allowed) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Permission denied by user.',
          is_error: true,
        })
        process.stderr.write(' (denied)\n')
        continue
      }

      const ctx: ToolUseContext = {
        toolUse: {
          type: 'tool_use',
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        },
        permissionMode: getPermissionMode(cwd) as 'default',
        toolPermissionContext: {
          mode: 'default',
          additionalWorkingDirectories: new Map(),
          alwaysAllowRules: {},
          alwaysDenyRules: {},
          isBypassPermissionsModeAvailable: false,
        },
        cwd,
        abortSignal: new AbortController().signal,
        messages: [],
        isInteractive: !process.stdin.isTTY ? false : true,
      }

      const result = await tool.execute(ctx, toolUse.input)
      process.stderr.write(' (' + (result.success ? 'ok' : 'fail') + ')\n')
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: !result.success,
      })
    }

    messages.push({ role: 'user', content: toolResults })
  }
}

function safeJsonMerge(
  existing: Record<string, unknown>,
  partial: string,
): Record<string, unknown> {
  try {
    return JSON.parse(partial)
  } catch {
    return {}
  }
}

const SYSTEM_PROMPT_TEMPLATE = `You are a coding agent running in the terminal. You are expected to be precise, safe, and helpful.

## How you work

- Communicate efficiently and keep the user informed.
- Fix problems at the root cause.
- Avoid unneeded complexity.
- Keep changes consistent with existing code style.
- For complex tasks, use TaskCreate/TaskUpdate to track sub-tasks.
- Use EnterPlanMode to propose plans before making major changes.

## Available tools

You have file operations (Read/Write/Edit/Grep/Glob/ApplyPatch), shell execution (Bash), web access (WebFetch/WebSearch), task management (TaskCreate/Update/List), plan mode (EnterPlanMode/ExitPlanMode), and skill discovery (Skill).

{context}`

main().catch(err => {
  logError('Fatal: ' + String(err))
  process.exit(1)
})
