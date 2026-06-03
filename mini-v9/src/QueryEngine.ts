import { query, type QueryOptions } from './query.js'
import type { QueryEvent } from './query/transitions.js'
import type { Tool } from './Tool.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { loadConfig } from './services/config/configManager.js'
import { getSystemContext } from './context.js'

export interface QueryEngineOptions {
  systemPrompt?: string
  messages?: BetaMessageParam[]
  tools?: Tool[]
  maxTurns?: number
  model?: string
  fallbackModel?: string
  abortSignal?: AbortSignal
  isInteractive?: boolean
  onSystemContext?: (messages: BetaMessageParam[]) => Promise<string>
}

export interface QueryEngineSummary {
  turnCount: number
  totalInputTokens: number
  totalOutputTokens: number
  cacheHitRate?: number
}

export class QueryEngine {
  readonly messages: BetaMessageParam[]
  private systemPrompt: string
  private tools: Tool[]
  private model?: string
  private fallbackModel?: string
  private maxTurns: number
  private abortController: AbortController
  private totalInputTokens = 0
  private totalOutputTokens = 0
  private totalCacheCreationInputTokens = 0
  private totalCacheReadInputTokens = 0
  private turnCount = 0
  private lastTerminalReason?: string

  constructor(options: QueryEngineOptions = {}) {
    this.systemPrompt =
      options.systemPrompt ??
      'You are Claude Code Mini v8, a coding agent with multi-agent coordination capabilities.'
    this.messages = options.messages ?? []
    this.tools = options.tools ?? []
    this.model = options.model
    this.fallbackModel = options.fallbackModel ?? options.model
    this.maxTurns = options.maxTurns ?? loadConfig().maxTurns ?? 50
    // Accept external AbortSignal by linking to internal AbortController
    if (options.abortSignal) {
      this.abortController = new AbortController()
      options.abortSignal.addEventListener('abort', () => this.abortController.abort(), { once: true })
    } else {
      this.abortController = new AbortController()
    }
  }

  setModel(model: string): void {
    this.model = model
  }

  setTools(tools: Tool[]): void {
    this.tools = tools
  }

  interrupt(): void {
    this.abortController.abort()
    this.resetAbortController()
  }

  private resetAbortController(): void {
    this.abortController = new AbortController()
  }

  getTotalInputTokens(): number {
    return this.totalInputTokens
  }

  getTotalOutputTokens(): number {
    return this.totalOutputTokens
  }

  getTurnCount(): number {
    return this.turnCount
  }

  // ===== New methods (full-version aligned) =====

  /** Reset all statistics */
  resetStats(): void {
    this.totalInputTokens = 0
    this.totalOutputTokens = 0
    this.totalCacheCreationInputTokens = 0
    this.totalCacheReadInputTokens = 0
    this.turnCount = 0
    this.lastTerminalReason = undefined
  }

  /** Get a formatted summary of the engine state */
  getSummary(): QueryEngineSummary {
    const cacheTotal = this.totalCacheCreationInputTokens + this.totalCacheReadInputTokens
    return {
      turnCount: this.turnCount,
      totalInputTokens: this.totalInputTokens,
      totalOutputTokens: this.totalOutputTokens,
      cacheHitRate: cacheTotal > 0
        ? this.totalCacheReadInputTokens / cacheTotal
        : undefined,
    }
  }

  /** Whether more turns can be submitted */
  canContinue(): boolean {
    return this.lastTerminalReason !== 'aborted'
  }

  async *submitMessage(
    userInput: string,
    options?: Partial<QueryOptions>,
  ): AsyncGenerator<QueryEvent> {
    this.messages.push({ role: 'user', content: userInput })

    const gen = query(this.systemPrompt, this.messages, this.tools, {
      model: this.model,
      fallbackModel: this.fallbackModel,
      maxTurns: this.maxTurns,
      abortSignal: this.abortController.signal,
      isInteractive: options?.isInteractive,
      canUseTool: options?.canUseTool,
      getCwd: options?.getCwd,
      onSystemContext: async msgs =>
        options?.onSystemContext?.(msgs) ??
        getSystemContext(undefined, {
          conversationMessages: msgs,
          sessionMemoryMode: 'auto',
        }),
    })

    for await (const event of gen) {
      switch (event.type) {
        case 'usage':
          this.totalInputTokens = event.totalInputTokens
          this.totalOutputTokens = event.totalOutputTokens
          break
        case 'turn_end':
          this.turnCount = event.turnCount
          break
        case 'terminal':
          this.lastTerminalReason = event.reason
          break
      }
      yield event
    }
  }
}
