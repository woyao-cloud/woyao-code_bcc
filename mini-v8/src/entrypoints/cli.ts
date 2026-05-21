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
import {
  drainNotifications,
  hasPendingNotifications,
  buildTaskNotificationXML,
} from '../services/notificationQueue.js'
import { requestPermission } from '../services/permission/permissionManager.js'
import {
  connectMCPServers,
  disconnectMCPServers,
} from '../services/mcp/mcpClient.js'
import { loadConfig } from '../services/config/configManager.js'
import { query } from '../query.js'
import { QueryEngine } from '../QueryEngine.js'
import { createInterface } from 'readline'
import { stdin, stdout } from 'process'
import {
  createConversationBuffers,
  serializeConversationBuffers,
  restoreLastSummarizedMessageIdFromBoundaries,
  type ConversationBuffers,
} from '../services/messages/apiProjection.js'
import {
  dispatchCommand,
  initializeCommands,
  type CommandContext,
} from '../commands/index.js'

// Plugin/Skill ecosystem imports
import { loadAllPlugins, type LoadedPlugin } from '../plugins/index.js'
import { discoverSkills } from '../services/skill/skillLoader.js'

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

// Agent system imports
import { initAgentRegistry, getAllAgents } from '../agents/agentRegistry.js'
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

  // Initialize command registry (auto-dispatches /commands)
  // MCP entries getter returns the current entries (updated after connection)
  const getMcpEntries = () => mcpEntries
  initializeCommands(
    conv => persistConversationSnapshot(conv),
    () => loadConfig(),
    () => loadedPlugins,
    getMcpEntries,
  )

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
  const engine = new QueryEngine({
    messages: conversation.fullMessages,
    systemPrompt:
      'You are Claude Code Mini v8, a coding agent with multi-agent coordination capabilities. You have access to tools for file operations, shell execution, web access, memory management, plugin/skill ecosystem, and agent orchestration (Agent tool, TeamCreate/TeamDelete for swarm coordination).',
    tools,
    model: resolveModel(),
  })

  while (true) {
    // Drain pending task notifications (from background agents) before user input
    if (hasPendingNotifications()) {
      const notifs = drainNotifications()
      for (const notif of notifs) {
        const xml = buildTaskNotificationXML(notif)
        conversation.fullMessages.push({ role: 'user', content: xml })
        process.stderr.write(
          `  [Notification] ${notif.agentType} ${notif.status}: ${notif.summary.slice(0, 60)}\n`,
        )
      }
    }

    const line = await question('> ')

    if (line === null) break // Ctrl+D
    if (line.trim() === '') continue

    // Route through command registry
    const cmdResult = await dispatchCommand(line, {
      args: '',
      conversation,
      messages: conversation.fullMessages,
      cwd: getCwd(),
    })
    if (cmdResult !== null) {
      if (cmdResult === '__EXIT__') break
      process.stderr.write(cmdResult + '\n')
      continue
    }

    conversation.fullMessages.push({ role: 'user', content: line })
    persistConversationSnapshot(conversation)
    await runConversationTurn(engine, conversation, tools)
  }
}

async function runConversation(
  prompt: string,
  _config: unknown,
  resumeSnapshot: PersistedSessionSnapshot | null,
) {
  const tools = getTools()
  const conversation = createConversationFromSnapshot(resumeSnapshot)
  const engine = new QueryEngine({
    messages: conversation.fullMessages,
    systemPrompt:
      'You are Claude Code Mini v8, a coding agent with multi-agent coordination capabilities. You have access to tools for file operations, shell execution, web access, memory management, plugin/skill ecosystem, and agent orchestration (Agent tool, TeamCreate/TeamDelete for swarm coordination).',
    tools,
    model: resolveModel(),
  })
  await runConversationTurn(engine, conversation, tools, prompt)
}

async function runConversationTurn(
  engine: QueryEngine,
  conversation: ConversationBuffers,
  tools: Tool[],
  preprompt?: string,
) {
  const spinChars = ['/', '-', '\\', '|']
  let spinIdx = 0
  let spinInterval: ReturnType<typeof setInterval> | null = null
  let gotFirstToken = false

  const startSpinner = () => {
    gotFirstToken = false
    spinInterval = setInterval(() => {
      if (gotFirstToken) {
        clearInterval(spinInterval!)
        spinInterval = null
        return
      }
      process.stderr.write('\r  ' + (spinChars[spinIdx] ?? '') + ' Thinking...')
      spinIdx = (spinIdx + 1) % 4
    }, 120)
  }

  const stopSpinner = () => {
    if (spinInterval) {
      clearInterval(spinInterval)
      spinInterval = null
    }
    process.stderr.write('\r' + ' '.repeat(40) + '\r')
  }

  const gen = preprompt
    ? engine.submitMessage(preprompt, {
        onSystemContext: async msgs =>
          getSystemContext(undefined, {
            conversationMessages: msgs,
            sessionMemoryMode: 'auto',
          }),
      })
    : engine.submitMessage('', {
        onSystemContext: async msgs =>
          getSystemContext(undefined, {
            conversationMessages: msgs,
            sessionMemoryMode: 'auto',
          }),
      })

  let totalInputTokens = 0
  let totalOutputTokens = 0
  let turnCount = 0
  let lastToolName = ''

  startSpinner()

  for await (const event of gen) {
    switch (event.type) {
      case 'text_delta':
        if (!gotFirstToken) {
          gotFirstToken = true
          stopSpinner()
        }
        process.stdout.write(event.text)
        break

      case 'tool_start':
        if (lastToolName) process.stderr.write('\n')
        lastToolName = event.name
        process.stderr.write('  ' + event.name + '...')
        break

      case 'tool_result':
        if (event.isError) {
          process.stderr.write(' (fail)\n')
        } else if (lastToolName === event.name) {
          process.stderr.write(' (ok)\n')
        }
        break

      case 'usage':
        totalInputTokens = event.totalInputTokens
        totalOutputTokens = event.totalOutputTokens
        break

      case 'turn_end':
        turnCount = event.turnCount
        break

      case 'terminal':
        stopSpinner()
        lastToolName = ''

        if (turnCount > 1) {
          process.stderr.write(
            '\n  Tokens: ' +
              totalInputTokens +
              ' in / ' +
              totalOutputTokens +
              ' out | ' +
              turnCount +
              ' turns\n',
          )
        }

        if (shouldExtractMemory(conversation.fullMessages)) {
          const notes = extractSessionNotes(conversation.fullMessages)
          persistSessionMemory(notes)
          if (notes.length > 0) {
            process.stderr.write(
              '  Memory: ' + notes.length + ' notes extracted\n',
            )
          }
        }

        persistConversationSnapshot(conversation)
        break

      case 'error':
        stopSpinner()
        logError('Query error: ' + event.message)
        break
    }
  }
}

export interface ParsedCLIArgs {
  promptArgs: string[]
  resumeRequested: boolean
  resumeSessionId?: string
}

export function parseCLIArgs(rawArgs: string[]): ParsedCLIArgs {
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

  const buffers = createConversationBuffers(snapshot.conversation.fullMessages, {
    compactBoundaries: snapshot.conversation.compactBoundaries,
    forceCompactNextProjection:
      snapshot.conversation.forceCompactNextProjection,
    restoreToolResultBudgetState: true,
    toolResultBudgetRecords: snapshot.conversation.toolResultBudgetRecords,
  })

  // Restore boundary tracking from the last compact boundary metadata
  restoreLastSummarizedMessageIdFromBoundaries(buffers.compactBoundaries)

  return buffers
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
