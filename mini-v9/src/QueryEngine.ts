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
}

export class QueryEngine {
  readonly messages: BetaMessageParam[]
  private systemPrompt: string
  private tools: Tool[]
  private model?: string
  private maxTurns: number
  private abortController: AbortController
  private totalInputTokens = 0
  private totalOutputTokens = 0
  private turnCount = 0

  constructor(options: QueryEngineOptions = {}) {
    this.systemPrompt =
      options.systemPrompt ??
      'You are Claude Code Mini v8, a coding agent with multi-agent coordination capabilities.'
    this.messages = options.messages ?? []
    this.tools = options.tools ?? []
    this.model = options.model
    this.maxTurns = options.maxTurns ?? loadConfig().maxTurns ?? 50
    this.abortController = new AbortController()
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

  async *submitMessage(
    userInput: string,
    options?: Partial<QueryOptions>,
  ): AsyncGenerator<QueryEvent> {
    this.messages.push({ role: 'user', content: userInput })

    const gen = query(this.systemPrompt, this.messages, this.tools, {
      model: this.model,
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
      }
      yield event
    }
  }
}
