#!/usr/bin/env bun
import { existsSync } from 'fs'
import { getSystemContext } from '../context.js'
import { getTools, registerMCPTools } from '../tools/tools.js'
import { streamClaudeAPI } from '../services/api/claude.js'
import { getCwd, setCwd } from '../bootstrap/state.js'
import { resolveModel } from '../utils/model/model.js'
import { getAPIKey } from '../utils/auth.js'
import { getPermissionMode } from '../utils/settings/settings.js'
import { logError, logInfo, logWarning, logDebug } from '../utils/log.js'
import { createDefaultTurnLimitManager } from '../utils/turnLimit.js'
import type { ContentItem } from '../types/message.js'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { Tool, ToolUseContext } from '../Tool.js'
import { createAbortController } from '../utils/abortController.js'
import {
  getAPIProvider,
  getBaseURL,
  isOpenAIProvider,
  detectOllama,
  setAutoDetectedProvider,
  isOllamaAutoDetected,
} from '../utils/model/providers.js'
import { initializeTaskStore } from '../services/taskStore.js'
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
import { recoverPlanState } from '../services/planMode.js'
import { enableV2 as enablePlanModeV2 } from '../services/planModeV2.js'
import { query } from '../query.js'
import { QueryEngine } from '../QueryEngine.js'
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

// UI module imports
import {
  parseCLIArgs,
  resolveResumeSnapshot,
  restoreSnapshotCwd,
  createConversationFromSnapshot,
  persistConversationSnapshot,
} from '../ui/session.js'
import { readInput } from '../ui/input.js'
import { createSpinner } from '../ui/spinner.js'
import { createUIStateManager } from '../ui/state.js'
import { createEventContext, handleEvent } from '../ui/events.js'
import { createStatusBar } from '../ui/statusBar.js'
import { green, yellow, dim, cyan } from '../ui/format.js'

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
  initializeTaskStore()
  enablePlanModeV2()

  const cliArgs = parseCLIArgs(process.argv.slice(2))
  const args = cliArgs.promptArgs
  const resumeSnapshot = resolveResumeSnapshot(cliArgs)
  const didRestoreCwd = restoreSnapshotCwd(resumeSnapshot)

  // If resuming a session, try to recover plan state from disk
  if (resumeSnapshot) {
    const planRecovered = recoverPlanState()
    if (planRecovered) {
      process.stderr.write('Plan mode: recovered active plan from disk\n')
    }
  }

  // Auto-detect local Ollama for zero-config experience
  if (await detectOllama()) {
    setAutoDetectedProvider('openai')
  }

  const provider = getAPIProvider()
  process.stderr.write(`Using API provider: ${provider}\n`)
  const apiKey = getAPIKey()

  // Check API key requirements based on provider
  if (!apiKey) {
    if (provider === 'firstParty') {
      process.stderr.write('Error: ANTHROPIC_API_KEY not set\n')
      process.exit(1)
    } else if (provider === 'openai' && !isOllamaAutoDetected()) {
      process.stderr.write('Error: OPENAI_API_KEY not set\n')
      process.exit(1)
    } else if (provider === 'gemini') {
      process.stderr.write('Error: GEMINI_API_KEY not set\n')
      process.exit(1)
    }
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
  resumeSnapshot: import('../ui/session.js').PersistedSessionSnapshot | null,
) {
  const tools = getTools()
  const skillCount = discoverSkills(getCwd()).length
  const agentCount = getAllAgents().length
  const modelName = resolveModel()
  const baseUrl = getBaseURL()
  process.stderr.write(
    'Claude Code Mini v8.0.0 | ' +
      modelName +
      ' | ' +
      baseUrl +
      ' | ' +
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
      'You are Claude Code Mini v8, a coding agent with multi-agent coordination capabilities. You have access to tools for file operations, shell execution, web access, memory management, plugin/skill ecosystem, and agent orchestration (Agent tool, TeamCreate/TeamDelete for swarm coordination). ' +
      'IMPORTANT: For real-time information questions (like weather, news, stock prices, current events, or anything that requires up-to-date data), you MUST use the WebSearch tool to get accurate, current information. ' +
      'Do NOT answer questions about current weather, prices, or real-time data from your training data - always search the web first.',
    tools,
    model: modelName,
  })

  const inputHistory: string[] = []

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

    const line = await readInput({ prompt: '> ', history: inputHistory })

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

    await runConversationTurn(engine, conversation, tools, line)
  }
}

async function runConversation(
  prompt: string,
  _config: unknown,
  resumeSnapshot: import('../ui/session.js').PersistedSessionSnapshot | null,
) {
  const tools = getTools()
  const modelName = resolveModel()
  const baseUrl = getBaseURL()
  process.stderr.write('Model: ' + modelName + ' | ' + baseUrl + '\n')
  const conversation = createConversationFromSnapshot(resumeSnapshot)
  const engine = new QueryEngine({
    messages: conversation.fullMessages,
    systemPrompt:
      'You are Claude Code Mini v8, a coding agent with multi-agent coordination capabilities. You have access to tools for file operations, shell execution, web access, memory management, plugin/skill ecosystem, and agent orchestration (Agent tool, TeamCreate/TeamDelete for swarm coordination).',
    tools,
    model: modelName,
  })
  await runConversationTurn(engine, conversation, tools, prompt)
}

async function runConversationTurn(
  engine: QueryEngine,
  conversation: ConversationBuffers,
  tools: Tool[],
  preprompt?: string,
) {
  const spinner = createSpinner()
  const stateManager = createUIStateManager()
  const eventCtx = createEventContext(spinner, stateManager)
  const statusBar = createStatusBar(stateManager)

  logInfo(
    `User input received: "${preprompt?.substring(0, 50)}${preprompt && preprompt.length > 50 ? '...' : ''}"`,
  )

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

  spinner.start()
  statusBar.start()

  try {
    logDebug('Starting message processing loop')

    for await (const event of gen) {
      logInfo(`event type: "${event.type}"`)
      handleEvent(eventCtx, event)

      switch (event.type) {
        case 'terminal': {
          statusBar.stop()

          if (eventCtx.turnCount > 1) {
            process.stderr.write(
              '\n  Tokens: ' +
                eventCtx.totalInputTokens +
                ' in / ' +
                eventCtx.totalOutputTokens +
                ' out | ' +
                eventCtx.turnCount +
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
        }

        case 'error': {
          statusBar.stop()
          logError('Query error: ' + event.message)
          break
        }
      }
    }
  } catch (err: unknown) {
    statusBar.stop()
    spinner.stop()
    const msg = err instanceof Error ? err.message : String(err)
    logError('Conversation error: ' + msg)
    process.stderr.write(`\n  Error: ${msg}\n`)
  }
}

main().catch(err => {
  logError('Fatal: ' + String(err))
  process.exit(1)
})
