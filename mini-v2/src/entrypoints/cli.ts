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
  // Setup MACRO
  if (typeof globalThis.MACRO === 'undefined') {
    ;(globalThis as unknown as Record<string, unknown>).MACRO = {
      VERSION: '2.0.0',
      BUILD_TIME: new Date().toISOString(),
    }
  }

  const args = process.argv.slice(2)

  // Check for API key
  const apiKey = getAPIKey()
  const usingOpenAI = isOpenAIProvider()
  if (!apiKey) {
    const keyName = usingOpenAI ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
    process.stderr.write(
      'Error: ' + keyName + ' environment variable not set.\n',
    )
    process.stderr.write('Set it via: $env:' + keyName + '="your-key"\n')
    process.exit(1)
  }

  // Read prompt from args or stdin
  let prompt: string
  if (args.length > 0) {
    prompt = args.join(' ')
  } else {
    // Read from stdin
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    prompt = Buffer.concat(chunks).toString('utf-8').trim()
    if (!prompt) {
      process.stderr.write('Error: No prompt provided.\n')
      process.stderr.write(
        'Usage: echo "your prompt" | bun run src/entrypoints/cli.ts\n',
      )
      process.stderr.write(
        '   or: bun run src/entrypoints/cli.ts "your prompt"\n',
      )
      process.exit(1)
    }
  }

  const cwd = getCwd()
  const systemContext = await getSystemContext()
  const tools = getTools()
  const toolsMap = new Map(tools.map(t => [t.name, t]))
  const model = resolveModel()
  const provider = getAPIProvider()

  // Build full system prompt
  const systemPrompt = `You are a coding agent running in the terminal. You help users write, edit, and understand code.
You have access to tools for reading/writing files, executing shell commands, and searching code, and fetching web content.
Be concise, accurate, and helpful.

${systemContext}`

  // Messages array for the API
  const messages: BetaMessageParam[] = [{ role: 'user', content: prompt }]

  logInfo('Provider: ' + provider)
  logInfo('Model: ' + model)
  logInfo(`Tools: ${tools.map(t => t.name).join(', ')}`)
  logInfo(`Working: ${cwd}`)
  process.stderr.write(`Thinking...\n`)

  let turnCount = 0
  const maxTurns = 25

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
              process.stderr.write(`\n?? ${block.name}...`)
            } else if (block.type === 'text') {
              const tb: TextBlock = { type: 'text', text: '' }
              contentBlocks.push(tb)
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
            logDebug(
              `Stop: ${evt.delta.stop_reason} | Tokens: ${evt.usage.output_tokens}`,
            )
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
      logError('API error', err)
      break
    }

    // Print assistant text
    if (fullText) {
      process.stdout.write(fullText + '\n')
    }

    // If no tool calls, we're done
    if (toolUses.length === 0) {
      break
    }

    // Add assistant message to history
    const assistantContent: ContentItem[] = contentBlocks.map(b => {
      if (b.type === 'tool_use') {
        return { type: 'tool_use', id: b.id, name: b.name, input: b.input }
      }
      return { type: 'text', text: b.text }
    })
    messages.push({ role: 'assistant', content: assistantContent })

    // Execute tool calls
    const toolResults: ContentItem[] = []
    for (const toolUse of toolUses) {
      const tool = toolsMap.get(toolUse.name)
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Unknown tool: ${toolUse.name}`,
          is_error: true,
        })
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
        isInteractive: false,
      }

      const result = await tool.execute(ctx, toolUse.input)
      process.stderr.write(` ? (${result.success ? 'ok' : 'fail'})\n`)

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: !result.success,
      })
    }

    // Add tool results to messages
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

main().catch(err => {
  logError('Fatal error', err)
  process.exit(1)
})
