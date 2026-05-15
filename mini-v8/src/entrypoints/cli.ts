#!/usr/bin/env bun
import { existsSync } from 'fs'
import { getSystemContext } from '../context.js'
import { getTools, registerMCPTools } from '../tools/tools.js'
import { streamClaudeAPI } from '../services/api/claude.js'
import { getCwd, setCwd } from '../bootstrap/state.js'
import { resolveModel } from '../utils/model/model.js'
import { getAPIKey } from '../utils/auth.js'
import { getPermissionMode } from '../utils/settings/settings.js'
import { logError } from '../utils/log.js'
import { createDefaultTurnLimitManager } from '../utils/turnLimit.js'
import type { ContentItem } from '../types/message.js'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
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
  clearConversationBuffers,
  consumeForcedCompaction,
  createConversationBuffers,
  projectMessagesForAPI,
  requestForcedCompaction,
  serializeConversationBuffers,
  type ConversationBuffers,
} from '../services/messages/apiProjection.js'
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

// Memory system imports
import {
  initSession,
  endSession,
  shouldExtractMemory,
  extractSessionNotes,
  persistSessionMemory,
  getSessionId as getSessionMemoryId,
} from '../services/memory/sessionMemory.js'
import { getTeamMemoryForPrompt } from '../services/memory/teamMemorySync.js'
import {
  handleMemoryCommand,
  handleSessionMemoryCommand,
  handleMemoryStoresCommand,
  handleTeamMemoryCommand,
} from '../commands/memoryCommands.js'

// Agent system imports
import { initAgentRegistry, getAllAgents } from '../agents/agentRegistry.js'
import {
  handleAgentCommand,
  handleTeamCommand,
  handleSwarmCommand,
} from '../commands/agentCommands.js'
import {
  loadConversationSnapshot,
  loadLatestConversationSnapshot,
  saveConversationSnapshot,
  type PersistedSessionSnapshot,
} from '../services/session/sessionStore.js'

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
    VERSION: '8.0.0',
    BUILD_TIME: new Date().toISOString(),
  }
  resetTasks()

  const cliArgs = parseCLIArgs(process.argv.slice(2))
  const args = cliArgs.promptArgs
  const resumeSnapshot = resolveResumeSnapshot(cliArgs)
  const didRestoreCwd = restoreSnapshotCwd(resumeSnapshot)
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

  // Initialize agent registry (discovers built-in + user + project + plugin agents)
  initAgentRegistry(getCwd(), loadedPlugins)
  const agentCount = getAllAgents().length
  process.stderr.write(
    `Agents: ${agentCount} registered (${getAllAgents().filter(a => a.source === 'built-in').length} built-in)\n`,
  )

  // Initialize memory system
  initSession(resumeSnapshot?.sessionId)
  const sid = getSessionMemoryId()
  process.stderr.write(
    'Memory: session ' +
      (sid ?? 'none') +
      (resumeSnapshot ? ' resumed' : ' initialized') +
      '\n',
  )
  if (cliArgs.resumeRequested && !resumeSnapshot) {
    process.stderr.write('Resume: no saved snapshot found, starting fresh.\n')
  } else if (resumeSnapshot) {
    process.stderr.write(
      'Resume: restored ' +
        resumeSnapshot.conversation.fullMessages.length +
        ' full messages' +
        (didRestoreCwd ? ' and cwd' : '') +
        '.\n',
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
      await runConversation(prompt, config, resumeSnapshot)
    } else {
      await runREPL(config, resumeSnapshot)
    }
  } finally {
    disconnectMCPServers(mcpEntries)
    endSession()
  }
}

async function runREPL(
  _config: unknown,
  resumeSnapshot: PersistedSessionSnapshot | null,
) {
  const tools = getTools()
  const skillCount = discoverSkills(getCwd()).length
  const agentCount = getAllAgents().length
  process.stderr.write(
    'Claude Code Mini v8.0.0 | ' +
      tools.length +
      ' tools | ' +
      loadedPlugins.length +
      ' plugins | ' +
      skillCount +
      ' skills | ' +
      agentCount +
      ' agents\n',
  )
  process.stderr.write('Type /help, Ctrl+C cancel, Ctrl+D exit\n\n')

  const conversation = createConversationFromSnapshot(resumeSnapshot)

  while (true) {
    const line = await question('> ')

    if (line === null) break // Ctrl+D
    if (line.trim() === '') continue

    if (line === '/help') {
      process.stderr.write(
        [
          'Commands:',
          '  /help               - Show this help',
          '  /exit /quit /q      - Exit',
          '  /clear              - Clear conversation',
          '  /model <name>       - Change model',
          '  /compact            - Compact conversation context',
          '',
          '  /plugin ...         - Plugin management',
          '  /skill ...          - Skill discovery & install',
          '  /memory ...         - Memory management',
          '  /session-memory ... - Session memory',
          '  /memory-stores ...  - Memory stores',
          '  /sync-memory ...    - Team memory sync',
          '  /agent ...          - Agent management & execution',
          '  /team ...           - Team management',
          '  /swarm ...          - Swarm coordination',
        ].join('\n') + '\n',
      )
      continue
    }

    if (line === '/exit' || line === '/quit' || line === '/q') {
      process.stderr.write('Goodbye.\n')
      break
    }

    if (line === '/clear') {
      clearConversationBuffers(conversation)
      persistConversationSnapshot(conversation)
      process.stderr.write('Conversation cleared.\n')
      continue
    }

    if (line.startsWith('/model ')) {
      const modelName = line.slice('/model '.length).trim()
      process.stderr.write(
        'Model set to: ' + modelName + ' (effective on next turn)\n',
      )
      continue
    }

    if (line === '/compact') {
      const activeModel = resolveModel()
      const { didMicrocompact, didBudgetToolResults, didCompact } =
        projectMessagesForAPI(conversation, {
          model: activeModel,
          forceCompact: true,
          commitCompactionToConversation: true,
        })
      if (didCompact) {
        requestForcedCompaction(conversation)
        process.stderr.write('Next API turn will use a compacted projection.\n')
      } else if (didBudgetToolResults) {
        process.stderr.write(
          'Next API turn will use budgeted tool result previews.\n',
        )
      } else if (didMicrocompact) {
        process.stderr.write(
          'Next API turn will use microcompacted tool results.\n',
        )
      } else {
        process.stderr.write(
          'No compaction needed (' +
            conversation.fullMessages.length +
            ' full messages).\n',
        )
      }
      persistConversationSnapshot(conversation)
      continue
    }

    // Plugin commands
    if (line.startsWith('/plugin')) {
      const result = await handlePluginCommand(line, getLoadedPlugins, getCwd())
      process.stderr.write(result + '\n')
      continue
    }

    // Skill commands
    if (line.startsWith('/skill')) {
      const subArgs = line.slice('/skill'.length).trim()
      let result: string
      if (subArgs.startsWith('search')) {
        const query = subArgs.slice('search'.length).trim()
        if (isSkillSearchEnabled()) {
          const allSkills = discoverSkills(getCwd())
          const found = searchLocalSkills(allSkills, query)
          result =
            found.length === 0
              ? 'No matching skills found.'
              : `Skills matching "${query}":\n` +
                found.map(s => `  ${s.name} (${s.source})`).join('\n')
        } else {
          result = 'Skill search is not enabled.'
        }
      } else {
        result = handleSkillSearchCommand(subArgs)
      }
      process.stderr.write(result + '\n')
      continue
    }

    // Memory commands
    if (line.startsWith('/memory ') || line === '/memory') {
      const subArgs = line.slice('/memory'.length).trim()
      const result = await handleMemoryCommand(
        subArgs,
        conversation.fullMessages,
      )
      process.stderr.write(result + '\n')
      continue
    }

    if (line.startsWith('/session-memory')) {
      const subArgs = line.slice('/session-memory'.length).trim()
      const result = await handleSessionMemoryCommand(subArgs)
      process.stderr.write(result + '\n')
      continue
    }

    if (line.startsWith('/memory-stores')) {
      const subArgs = line.slice('/memory-stores'.length).trim()
      const result = await handleMemoryStoresCommand(subArgs)
      process.stderr.write(result + '\n')
      continue
    }

    if (line.startsWith('/sync-memory')) {
      const subArgs = line.slice('/sync-memory'.length).trim()
      const result = await handleTeamMemoryCommand(subArgs)
      process.stderr.write(result + '\n')
      continue
    }

    // Agent commands
    if (line.startsWith('/agent')) {
      const subArgs = line.slice('/agent'.length).trim()
      const result = await handleAgentCommand(subArgs, getCwd(), loadedPlugins)
      process.stderr.write(result + '\n')
      continue
    }

    // Team commands
    if (line.startsWith('/team')) {
      const subArgs = line.slice('/team'.length).trim()
      const result = await handleTeamCommand(subArgs)
      process.stderr.write(result + '\n')
      continue
    }

    // Swarm commands
    if (line.startsWith('/swarm')) {
      const subArgs = line.slice('/swarm'.length).trim()
      const result = await handleSwarmCommand(subArgs)
      process.stderr.write(result + '\n')
      continue
    }

    conversation.fullMessages.push({ role: 'user', content: line })
    persistConversationSnapshot(conversation)
    await runConversationTurn(conversation, tools)
  }
}

async function runConversation(
  prompt: string,
  _config: unknown,
  resumeSnapshot: PersistedSessionSnapshot | null,
) {
  const tools = getTools()
  const conversation = createConversationFromSnapshot(resumeSnapshot)
  conversation.fullMessages.push({ role: 'user', content: prompt })
  persistConversationSnapshot(conversation)
  await runConversationTurn(conversation, tools)
}

async function runConversationTurn(
  conversation: ConversationBuffers,
  tools: Tool[],
) {
  const cwd = getCwd()
  const toolsMap = new Map(tools.map(t => [t.name, t]))

  let totalInputTokens = 0
  let totalOutputTokens = 0

  const config = loadConfig()
  const turnLimitManager = createDefaultTurnLimitManager(config.maxTurns)

  while (true) {
    const turnResult = turnLimitManager.increment()

    // Check if we've reached the turn limit
    if (!turnResult.shouldContinue) {
      break
    }

    const activeModel = resolveModel()
    const forceCompact = consumeForcedCompaction(conversation)
    const { messagesForAPI } = projectMessagesForAPI(conversation, {
      model: activeModel,
      forceCompact,
      commitCompactionToConversation: forceCompact,
    })

    const systemContext = await getSystemContext(undefined, {
      conversationMessages: messagesForAPI,
      sessionMemoryMode: 'auto',
    })
    const systemPrompt =
      `You are Claude Code Mini v8, a coding agent with multi-agent coordination capabilities. You have access to tools for file operations, shell execution, web access, memory management, plugin/skill ecosystem, and agent orchestration (Agent tool, TeamCreate/TeamDelete for swarm coordination).\n\n` +
      systemContext

    const toolUses: ToolUseBlock[] = []
    const contentBlocks: ContentBlock[] = []
    let fullText = ''
    let streamComplete = false

    // Show spinner
    const spinChars = ['/', '-', '\\', '|']
    let spinIdx = 0
    const spinInterval = setInterval(() => {
      if (streamComplete || fullText.length > 0) {
        clearInterval(spinInterval)
        return
      }
      process.stderr.write('\r  ' + (spinChars[spinIdx] ?? '') + ' Thinking...')
      spinIdx = (spinIdx + 1) % 4
    }, 120)
    const clear = () => {
      clearInterval(spinInterval)
      process.stderr.write('\r' + ' '.repeat(40) + '\r')
    }

    try {
      await withRetry(
        async () => {
          const stream = streamClaudeAPI({
            messages: messagesForAPI,
            systemPrompt,
            tools,
            model: resolveModel(),
          })

          for await (const event of stream) {
            const evt = event as BetaRawMessageStreamEvent
            switch (evt.type) {
              case 'message_start':
                break
              case 'content_block_start': {
                const block = evt.content_block
                if (block.type === 'tool_use') {
                  const tu: ToolUseBlock = {
                    type: 'tool_use',
                    id: block.id,
                    name: block.name,
                    input: (block.input as Record<string, unknown>) || {},
                  }
                  toolUses.push(tu)
                  contentBlocks.push(tu)
                  process.stderr.write('\n  ' + block.name + '...')
                } else if (block.type === 'text')
                  contentBlocks.push({
                    type: 'text',
                    text: '',
                  })
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
                  if (lt) {
                    const raw =
                      (delta as unknown as Record<string, string>)
                        .partial_json || ''
                    const short =
                      raw && raw.length > 80 ? raw.slice(0, 80) + '...' : raw
                    process.stderr.write(`[dbg] input_json_delta #${jsonBuf.size} raw=${short}
`)
                    lt.input = safeJsonMerge(lt.input, raw, lt.id)
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
          streamComplete = true
        },
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

    const assistantContent: ContentItem[] = contentBlocks.map(b =>
      b.type === 'tool_use'
        ? {
            type: 'tool_use',
            id: b.id,
            name: b.name,
            input: b.input,
          }
        : { type: 'text', text: b.text },
    )
    if (assistantContent.length > 0) {
      conversation.fullMessages.push({
        role: 'assistant',
        content: assistantContent,
      })
      persistConversationSnapshot(conversation)
    }

    if (toolUses.length === 0) {
      const currentTurnCount = turnLimitManager.getTurnCount()
      if (currentTurnCount > 1)
        process.stderr.write(
          '\n  Tokens: ' +
            totalInputTokens +
            ' in / ' +
            totalOutputTokens +
            ' out | ' +
            currentTurnCount +
            ' turns\n',
        )
      break
    }

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

    conversation.fullMessages.push({
      role: 'user',
      content: toolResults,
    })
    persistConversationSnapshot(conversation)

    // Auto-extract session memory if threshold met
    if (shouldExtractMemory(conversation.fullMessages)) {
      const notes = extractSessionNotes(conversation.fullMessages)
      persistSessionMemory(notes)
      if (notes.length > 0) {
        process.stderr.write('  Memory: ' + notes.length + ' notes extracted\n')
      }
    }
  }
}

interface ParsedCLIArgs {
  promptArgs: string[]
  resumeRequested: boolean
  resumeSessionId?: string
}

function parseCLIArgs(rawArgs: string[]): ParsedCLIArgs {
  const promptArgs: string[] = []
  let resumeRequested = false
  let resumeSessionId: string | undefined

  for (const arg of rawArgs) {
    if (arg === '--resume') {
      resumeRequested = true
      continue
    }

    if (arg.startsWith('--resume=')) {
      resumeRequested = true
      const explicitSessionId = arg.slice('--resume='.length).trim()
      if (explicitSessionId) {
        resumeSessionId = explicitSessionId
      }
      continue
    }

    promptArgs.push(arg)
  }

  return {
    promptArgs,
    resumeRequested,
    ...(resumeSessionId ? { resumeSessionId } : {}),
  }
}

function resolveResumeSnapshot(
  args: ParsedCLIArgs,
): PersistedSessionSnapshot | null {
  if (!args.resumeRequested) {
    return null
  }

  if (args.resumeSessionId) {
    return loadConversationSnapshot(args.resumeSessionId)
  }

  return loadLatestConversationSnapshot()
}

function restoreSnapshotCwd(
  snapshot: PersistedSessionSnapshot | null,
): boolean {
  const snapshotCwd = snapshot?.cwd?.trim()
  if (!snapshotCwd || !existsSync(snapshotCwd)) {
    return false
  }

  try {
    process.chdir(snapshotCwd)
  } catch {}

  setCwd(snapshotCwd)
  return true
}

function createConversationFromSnapshot(
  snapshot: PersistedSessionSnapshot | null,
): ConversationBuffers {
  if (!snapshot) {
    return createConversationBuffers()
  }

  return createConversationBuffers(snapshot.conversation.fullMessages, {
    compactBoundaries: snapshot.conversation.compactBoundaries,
    forceCompactNextProjection:
      snapshot.conversation.forceCompactNextProjection,
    restoreToolResultBudgetState: true,
    toolResultBudgetRecords: snapshot.conversation.toolResultBudgetRecords,
  })
}

function persistConversationSnapshot(conversation: ConversationBuffers): void {
  const sessionId = getSessionMemoryId()
  if (!sessionId) {
    return
  }

  saveConversationSnapshot({
    sessionId,
    cwd: getCwd(),
    model: resolveModel(),
    conversation: serializeConversationBuffers(conversation),
  })
}

function question(prompt: string): Promise<string | null> {
  const rl = createInterface({ input: stdin, output: stdout })
  let resolved = false
  return new Promise(resolve => {
    const done = (value: string | null) => {
      if (!resolved) {
        resolved = true
        resolve(value)
      }
    }
    rl.question(prompt, answer => {
      done(answer)
      rl.close()
    })
    rl.on('close', () => done(null))
  })
}

// Buffered JSON string per tool use (for diagnostic logging)
const jsonBuf = new Map<string, string>()

function safeJsonMerge(
  existing: Record<string, unknown>,
  partial: string,
  toolUseId: string,
): Record<string, unknown> {
  const prev = jsonBuf.get(toolUseId) || ''

  try {
    const parsed = JSON.parse(partial) as Record<string, unknown>
    // Merge with existing object to preserve previously accumulated fields
    return { ...existing, ...parsed }
  } catch {
    // Log the unparseable partial for debugging
    const snippet =
      partial.length > 120 ? partial.slice(0, 120) + '...' : partial
    process.stderr.write(
      `[dbg] partial_json parse (len=${partial.length}): ${snippet}\n`,
    )
  }

  const buf = prev + partial
  jsonBuf.set(toolUseId, buf)

  try {
    const parsed = JSON.parse(buf) as Record<string, unknown>
    jsonBuf.delete(toolUseId)
    return { ...existing, ...parsed }
  } catch {
    return existing
  }
}

main().catch(err => {
  logError('Fatal: ' + String(err))
  process.exit(1)
})
