#!/usr/bin/env bun
import { getSystemContext } from '../context.js'
import { getTools, registerMCPTools } from '../tools/tools.js'
import { streamClaudeAPI } from '../services/api/claude.js'
import { getCwd, state } from '../bootstrap/state.js'
import { resolveModel } from '../utils/model/model.js'
import { getAPIKey } from '../utils/auth.js'
import { getPermissionMode } from '../utils/settings/settings.js'
import { logError } from '../utils/log.js'
import type { ContentItem } from '../types/message.js'
import type {
  BetaRawMessageStreamEvent,
  BetaMessageParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Tool, ToolUseContext } from '../Tool.js'
import { createAbortController } from '../utils/abortController.js'
import { isOpenAIProvider } from '../utils/model/providers.js'
import { resetTasks } from '../services/taskStore.js'
import { requestPermission } from '../services/permission/permissionManager.js'
import {
  connectMCPServers,
  disconnectMCPServers,
} from '../services/mcp/mcpClient.js'
import { loadConfig } from '../services/config/configManager.js'
import {
  needsCompaction,
  compactMessages,
} from '../services/compact/autoCompact.js'
import { withRetry, isRetryableError } from '../services/retry.js'
import { createInterface } from 'readline'
import { stdin, stdout } from 'process'

// Plugin/Skill ecosystem imports
import {
  loadAllPlugins,
  getPluginSkillFiles,
  type LoadedPlugin,
} from '../plugins/index.js'
import {
  discoverSkills,
  formatSkillsForPrompt,
} from '../services/skill/skillLoader.js'
import { handlePluginCommand } from '../commands/pluginCommands.js'
import {
  handleSkillStoreCommand,
  handleSkillSearchCommand,
  isSkillSearchEnabled,
  searchLocalSkills,
} from '../commands/skillCommands.js'

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

// Module-level cache for loaded plugins
let loadedPlugins: LoadedPlugin[] = []

function getLoadedPlugins(): LoadedPlugin[] {
  return loadedPlugins
}

async function main() {
  ;(globalThis as unknown as Record<string, unknown>).MACRO = {
    VERSION: '6.0.0',
    BUILD_TIME: new Date().toISOString(),
  }
  resetTasks()

  const args = process.argv.slice(2)
  const apiKey = getAPIKey()
  if (!apiKey) {
    const keyName = isOpenAIProvider() ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
    process.stderr.write('Error: ' + keyName + ' not set\n')
    process.exit(1)
  }

  // Load config
  const config = loadConfig()

  // Load plugin ecosystem
  loadedPlugins = loadAllPlugins(getCwd())
  if (loadedPlugins.length > 0) {
    process.stderr.write(
      `Plugins: ${loadedPlugins.length} loaded (${loadedPlugins.filter(p => p.enabled).length} enabled)\n`,
    )
  }

  // Connect MCP servers (best-effort)
  const mcpEntries = await connectMCPServers()
  registerMCPTools(mcpEntries)
  if (mcpEntries.length > 0) {
    const totalTools = mcpEntries.reduce((sum, e) => sum + e.tools.length, 0)
    process.stderr.write(
      'MCP: ' +
        mcpEntries.length +
        ' server(s) with ' +
        totalTools +
        ' tool(s) loaded\n',
    )
  }

  const isPiped = !process.stdin.isTTY
  const hasArgs = args.length > 0

  try {
    if (isPiped || hasArgs) {
      let prompt = ''
      if (hasArgs) {
        prompt = args.join(' ')
      } else {
        const chunks: Buffer[] = []
        for await (const chunk of process.stdin)
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
        prompt = Buffer.concat(chunks).toString('utf-8').trim()
      }
      if (!prompt) {
        process.exit(1)
      }
      await runConversation(prompt, config)
    } else {
      await runREPL(config)
    }
  } finally {
    disconnectMCPServers(mcpEntries)
  }
}

async function runREPL(_config: unknown) {
  const tools = getTools()
  const skillCount = discoverSkills(getCwd()).length
  process.stderr.write(
    `Claude Code Mini v6.0.0 | ${tools.length} tools | ${loadedPlugins.length} plugins | ${skillCount} skills\n`,
  )
  process.stderr.write('Type /help, Ctrl+C cancel, Ctrl+D exit\n\n')

  const messages: BetaMessageParam[] = []

  while (true) {
    const line = await readLine('> ')
    if (line === null) {
      process.stderr.write('\nGoodbye!\n')
      break
    }
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('/')) {
      const cmd = trimmed.slice(1).split(' ')[0]?.toLowerCase() ?? ''

      if (cmd === 'exit' || cmd === 'quit') {
        process.stderr.write('Goodbye!\n')
        break
      }
      if (cmd === 'help') {
        process.stderr.write(
          '/help /exit /clear /tools /config /plugin /skill-store /skill-search\n',
        )
        continue
      }
      if (cmd === 'clear') {
        messages.length = 0
        resetTasks()
        process.stderr.write('Cleared.\n')
        continue
      }
      if (cmd === 'tools') {
        process.stderr.write(
          'Available: ' +
            getTools()
              .map(t => t.name)
              .join(', ') +
            '\n',
        )
        continue
      }
      if (cmd === 'config') {
        process.stderr.write(JSON.stringify(loadConfig(), null, 2) + '\n')
        continue
      }
      if (cmd === 'plugin' || cmd === 'plugins') {
        const result = await handlePluginCommand(
          trimmed,
          getLoadedPlugins,
          getCwd(),
        )
        process.stderr.write(result + '\n')
        continue
      }
      if (cmd === 'skill-store' || cmd === 'ss') {
        const args = trimmed.slice(trimmed.indexOf(' ') + 1).trim() || ''
        const result = await handleSkillStoreCommand(args)
        process.stderr.write(result + '\n')
        continue
      }
      if (cmd === 'skill-search') {
        const args = trimmed.slice(trimmed.indexOf(' ') + 1).trim() || ''
        const result = handleSkillSearchCommand(args)
        process.stderr.write(result + '\n')
        continue
      }
      process.stderr.write('Unknown: ' + trimmed + '\n')
      continue
    }

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

async function runConversation(prompt: string, _config: unknown) {
  const tools = getTools()
  const messages: BetaMessageParam[] = []
  messages.push({ role: 'user', content: prompt })
  await runConversationTurn(messages)
}

function getMessageText(msg: BetaMessageParam): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter(
        (c): c is { type: 'text'; text: string } =>
          typeof c === 'object' &&
          c !== null &&
          'type' in c &&
          c.type === 'text' &&
          'text' in c,
      )
      .map(c => c.text)
      .join(' ')
  }
  return ''
}

async function runConversationTurn(messages: BetaMessageParam[]) {
  const cwd = getCwd()
  const model = resolveModel()
  const allTools = getTools()
  const toolsMap = new Map(allTools.map(t => [t.name, t]))

  // Load skills (including plugin skills)
  const pluginSkills = getPluginSkillFiles(loadedPlugins.filter(p => p.enabled))
  const allSkills = discoverSkills(cwd, pluginSkills)

  // Skill search: auto-inject relevant skills if enabled
  let skillContext = formatSkillsForPrompt(allSkills)
  if (isSkillSearchEnabled()) {
    const recentText = messages.slice(-3).map(getMessageText).join(' ')
    if (recentText.trim()) {
      const relevant = searchLocalSkills(allSkills, recentText)
      if (relevant.length > 0) {
        skillContext =
          '\n## Auto-matched Skills (Skill Search)\n' +
          relevant
            .slice(0, 5)
            .map(s => `- ${s.name}: ${s.content.slice(0, 300)}`)
            .join('\n') +
          '\n'
      }
    }
  }

  const systemPrompt = getSystemContext(skillContext)

  let turnCount = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0

  while (true) {
    turnCount++
    if (turnCount > 20) {
      process.stderr.write('Max turns (20) reached.\n')
      break
    }

    // Auto-compaction check
    if (needsCompaction(messages)) {
      process.stderr.write('Compacting conversation...\n')
      compactMessages(messages)
    }

    let fullText = ''
    let streamComplete = false
    const contentBlocks: ContentBlock[] = []
    const toolUses: ToolUseBlock[] = []

    const ac = createAbortController()
    const timer = setTimeout(() => ac.abort(), 60000)
    const clear = () => clearTimeout(timer)

    try {
      await withRetry(
        () =>
          streamClaudeAPI(systemPrompt, messages, allTools, model, {
            signal: ac.signal,
            onEvent: (evt: BetaRawMessageStreamEvent) => {
              switch (evt.type) {
                case 'message_start':
                  totalInputTokens += evt.message?.usage?.input_tokens ?? 0
                  break
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
                  } else if (block.type === 'text')
                    contentBlocks.push({ type: 'text', text: '' })
                  break
                }
                case 'content_block_delta': {
                  const delta = evt.delta
                  if (delta.type === 'text_delta') {
                    const lb = contentBlocks[contentBlocks.length - 1]
                    if (lb && lb.type === 'text') {
                      lb.text += delta.text
                      fullText += delta.text
                    }
                  } else if (delta.type === 'input_json_delta') {
                    const lt = toolUses[toolUses.length - 1]
                    if (lt)
                      lt.input = {
                        ...lt.input,
                        ...safeJsonMerge(lt.input, delta.partial_json),
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
            },
          }),
        {
          maxRetries: 2,
          onRetry: (attempt, err) => {
            if (isRetryableError(err)) {
              process.stderr.write('\n  Retrying (' + attempt + ')...')
            } else {
              throw err
            }
          },
        },
      )

      clear()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('abort')) {
        logError('Timeout')
        break
      }
      logError('API error: ' + msg)
      break
    }

    if (fullText) process.stdout.write(fullText + '\n')
    if (toolUses.length === 0) {
      if (turnCount > 1)
        process.stderr.write(
          '\n  Tokens: ' +
            totalInputTokens +
            ' in / ' +
            totalOutputTokens +
            ' out | ' +
            turnCount +
            ' turns\n',
        )
      break
    }

    const assistantContent: ContentItem[] = contentBlocks.map(b =>
      b.type === 'tool_use'
        ? { type: 'tool_use', id: b.id, name: b.name, input: b.input }
        : { type: 'text', text: b.text },
    )
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

      const allowed = await requestPermission({
        toolName: tool.name,
        toolDescription: tool.description,
        input: toolUse.input,
      })
      if (!allowed) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Permission denied.',
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
        isInteractive: true,
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

const SYSTEM_PROMPT_TEMPLATE = `You are a coding agent. Be precise, safe, and helpful.

- Fix problems at root cause. Avoid unneeded complexity.
- Use TaskCreate/TaskUpdate to track sub-tasks for complex work.
- Use EnterPlanMode before major changes.
- Use Skill tool to discover available skills.
- Tools: file ops (Read/Write/Edit/Grep/Glob/ApplyPatch), shell (Bash), web (WebFetch/WebSearch), tasks, plan mode, skills, and MCP tools.

{context}`

main().catch(err => {
  logError('Fatal: ' + String(err))
  process.exit(1)
})
