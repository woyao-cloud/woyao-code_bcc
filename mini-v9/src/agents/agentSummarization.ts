/**
 * Agent summarization for long-running agents.
 * Generates periodic progress snapshots that can be delivered
 * via notifications or used for agent checkpoints.
 */

import type { AgentProgress } from './agentTypes.js'

// ============================================================
// Types
// ============================================================

export interface SummarizationConfig {
  /** Generate a summary every N turns (default: 5) */
  interval: number
  /** Maximum summary length in characters (default: 500) */
  maxLength: number
}

export const DEFAULT_SUMMARIZATION_CONFIG: SummarizationConfig = {
  interval: 5,
  maxLength: 500,
}

/**
 * A progress snapshot generated periodically during agent execution.
 */
export interface AgentSummary {
  /** Agent instance ID */
  agentId: string
  /** Current turn count */
  turnCount: number
  /** Cumulative token usage */
  totalTokens: number
  /** Summary of work done so far */
  summary: string
  /** Remaining context window estimate */
  remainingContextPct: number
  /** Timestamp */
  timestamp: number
}

// ============================================================
// Summary Generation
// ============================================================

/**
 * Build a concise progress summary from the current agent state.
 * This is called periodically during long agent runs.
 */
export function buildAgentProgressSummary(
  agentId: string,
  turnCount: number,
  totalTokens: number,
  toolUseCount: number,
  recentOutput: string[],
  config: SummarizationConfig = DEFAULT_SUMMARIZATION_CONFIG,
): AgentSummary {
  const summary = summarizeRecentOutput(recentOutput, config.maxLength)

  // Estimate remaining context: assume ~200K context window
  const estimatedWindow = 200_000
  const remainingContextPct = Math.max(0, Math.round((1 - totalTokens / estimatedWindow) * 100))

  return {
    agentId,
    turnCount,
    totalTokens,
    summary,
    remainingContextPct,
    timestamp: Date.now(),
  }
}

/**
 * Convert an AgentSummary to a notification-friendly text format.
 */
export function formatSummaryForNotification(summary: AgentSummary): string {
  const lines: string[] = [
    `[Agent Progress] Turn ${summary.turnCount} | ${summary.totalTokens} tokens | ${summary.remainingContextPct}% context remaining`,
  ]
  if (summary.summary) {
    lines.push(`Progress: ${summary.summary}`)
  }
  return lines.join('\n')
}

/**
 * Decide whether a summary should be generated at this turn.
 */
export function shouldSummarize(
  turnCount: number,
  config: SummarizationConfig = DEFAULT_SUMMARIZATION_CONFIG,
): boolean {
  return turnCount > 0 && turnCount % config.interval === 0
}

/**
 * Convert an AgentProgress object to a formatted summary string.
 */
export function progressToSummaryString(progress: AgentProgress): string {
  const lines: string[] = [
    `Turn ${progress.turnCount} | ${progress.totalTokens} tokens | ${progress.toolUseCount} tool uses`,
  ]
  if (progress.summary) {
    lines.push(progress.summary)
  }
  return lines.join('\n')
}

// ============================================================
// Helpers
// ============================================================

function summarizeRecentOutput(
  recentOutput: string[],
  maxLength: number,
): string {
  if (recentOutput.length === 0) return ''

  // Take the last few output chunks
  const relevant = recentOutput.slice(-3)
  const text = relevant.join('\n').trim()

  if (text.length <= maxLength) return text

  // Truncate intelligently: try to break at sentence boundaries
  const truncated = text.slice(0, maxLength)
  const lastPeriod = truncated.lastIndexOf('.')
  const lastNewline = truncated.lastIndexOf('\n')

  if (lastPeriod > maxLength * 0.5) {
    return truncated.slice(0, lastPeriod + 1) + ' (...)'
  }
  if (lastNewline > maxLength * 0.5) {
    return truncated.slice(0, lastNewline) + '\n(...)'
  }

  return truncated + '...'
}
