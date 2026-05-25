/**
 * Fork subagent for cache-efficient parallel execution.
 * A forked subagent shares the parent's system prompt prefix so that
 * the API prefix cache is identical, while having its own message context.
 * Supports worktree isolation for safe experimentation.
 */

import { randomUUID } from 'crypto'
import { runAgentSync, type AgentRunOptions } from './agentRunner.js'
import type { AgentResult, ForkConfig, WorktreeConfig } from './agentTypes.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ============================================================
// Fork API
// ============================================================

export interface ForkSubagentOptions {
  /** Agent type to fork (e.g. "Explore", "general-purpose") */
  agentType: string
  /** Task prompt for the forked agent */
  prompt: string
  /** Parent messages for context continuity */
  parentMessages: BetaMessageParam[]
  /** Fork configuration */
  forkConfig: ForkConfig
  /** Worktree configuration (required when isolation is 'worktree') */
  worktreeConfig?: WorktreeConfig
  /** Model override */
  model?: string
  /** Progress callback */
  onProgress?: (summary: string) => void
}

/**
 * Run a forked subagent that shares the parent's context prefix.
 * The forked agent gets its own message list but uses the same
 * system prompt for cache efficiency.
 */
export async function runForkedAgent(options: ForkSubagentOptions): Promise<AgentResult> {
  const { agentType, prompt, parentMessages, forkConfig, model, onProgress } = options

  // Build parent tool result replacements for stable replay
  const parentToolResultReplacements = buildParentToolResultReplacements(parentMessages)

  const runOptions: AgentRunOptions = {
    agent: agentType,
    task: prompt,
    parentMessages,
    parentToolResultReplacements,
    maxTurns: forkConfig.maxTurns,
    model: model ?? forkConfig.model,
  }

  if (onProgress) {
    runOptions.onProgress = progress => {
      if (progress.summary) {
        onProgress(progress.summary)
      }
    }
  }

  // Run the forked agent
  const result = await runAgentSync(runOptions)

  return result
}

/**
 * Create a worktree isolation config for safe agent experimentation.
 * Returns both the ForkConfig and WorktreeConfig ready for use.
 */
export function createWorktreeIsolation(
  branchName?: string,
  autoRemove = true,
): { forkConfig: ForkConfig; worktreeConfig: WorktreeConfig } {
  const branch = branchName ?? `fork-${randomUUID().slice(0, 8)}`

  return {
    forkConfig: {
      enabled: true,
      isolation: 'worktree',
      maxTurns: 25,
    },
    worktreeConfig: {
      branch,
      autoRemove,
      discardChanges: true,
    },
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Build a map of parent tool-use-id → tool-result content for stable replay
 * in forked contexts. This allows the forked agent to "see" the results of
 * parent tool calls without re-executing them.
 */
function buildParentToolResultReplacements(
  messages: BetaMessageParam[],
): ReadonlyMap<string, string> {
  const replacements = new Map<string, string>()

  for (const msg of messages) {
    if (msg.role !== 'user') continue
    const content = msg.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        const text = typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? block.content.map(c => (typeof c === 'string' ? c : c.text ?? '')).join('\n')
            : ''
        replacements.set(block.tool_use_id, text)
      }
    }
  }

  return replacements
}

/**
 * Check if a worktree isolation is configured and return its config.
 */
export function getWorktreeConfig(fork: ForkConfig, worktree?: WorktreeConfig): WorktreeConfig | undefined {
  if (fork.isolation !== 'worktree') return undefined
  return worktree
}
