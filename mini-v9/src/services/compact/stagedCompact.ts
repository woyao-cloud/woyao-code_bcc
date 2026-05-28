/**
 * Staged Context Folding — proactively and progressively compacts conversation
 * as estimated context usage grows past configured thresholds.
 *
 * Unlike reactiveCompact (which fires on prompt_too_long errors), staged folding
 * checks usage after every turn and deepens the strategy as usage % increases.
 * This keeps headroom available and prevents surprise errors.
 *
 * Stages:
 *   0. No-op (usage < 50%)
 *   1. LLM-summarize oldest messages beyond 8 recent pairs (usage >= 50%)
 *   2. Microcompact + LLM-summarize beyond 5 recent pairs (usage >= 65%)
 *   3. Deterministic compact keepPairs:4 + microcompact (usage >= 80%)
 *   4. Deterministic compact keepPairs:2 + microcompact (usage >= 92%)
 *
 * Stages 1-2 use LLM-based compaction (one API call each, only fire once).
 * Stages 3-4 are deterministic and can re-apply each turn.
 */

import { estimateTokens, getEstimatedContextWindow, microcompactToolResults, compactMessages } from './autoCompact.js'
import { llmCompact } from './llmCompact.js'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ============================================================
// Types
// ============================================================

export interface StagedFoldResult {
  /** Whether any folding was applied */
  didFold: boolean
  /** The stage that was applied (0 = none) */
  stage: number
  /** Estimated context usage percentage (0-100) */
  usagePercent: number
  /** Folded messages (same as input if didFold is false) */
  messages: BetaMessageParam[]
}

// ============================================================
// Module-level state (session-scoped)
// ============================================================

/** Current stage — only ever increases */
let currentStage = 0
/** Number of times each stage has been applied (circuit-breaking) */
const stageApplicationCount = new Map<number, number>()

const MAX_APPLICATIONS_PER_STAGE = 1
const LLM_MAX_APPLICATIONS = 1 // Stages 1-2 use LLM, fire at most once

// ============================================================
// Stage definitions
// ============================================================

interface StageDef {
  /** Minimum usage percentage to enter this stage */
  threshold: number
  /** Number of recent pairs to preserve verbatim (for llmCompact direction 'up_to') */
  hotPairs: number
  /** Whether to run microcompact before other steps */
  microcompact: boolean
  /** Whether to use LLM-based compaction */
  useLlm: boolean
  /** Fallback keepPairs for deterministic compact if LLM fails or isn't used */
  keepPairs: number
  /** Whether this strategy is "deterministic only" (no API calls needed) */
  deterministic: boolean
}

const STAGES: StageDef[] = [
  { threshold: 0,   hotPairs: 0,  microcompact: false, useLlm: false, keepPairs: 0,  deterministic: true  }, // 0: no-op
  { threshold: 50,  hotPairs: 8,  microcompact: false, useLlm: true,  keepPairs: 0,  deterministic: false }, // 1: LLM fold
  { threshold: 65,  hotPairs: 5,  microcompact: true,  useLlm: true,  keepPairs: 0,  deterministic: false }, // 2: micro + LLM
  { threshold: 80,  hotPairs: 4,  microcompact: true,  useLlm: false, keepPairs: 4,  deterministic: true  }, // 3: deterministic
  { threshold: 92,  hotPairs: 2,  microcompact: true,  useLlm: false, keepPairs: 2,  deterministic: true  }, // 4: aggressive
]

// ============================================================
// Public API
// ============================================================

/**
 * Apply staged folding if estimated context usage crosses a threshold.
 * Returns the folded messages and which stage was applied.
 * Callers must sync their conversation buffer with the returned messages.
 */
export async function applyStagedFolding(
  messages: BetaMessageParam[],
  model: string,
): Promise<StagedFoldResult> {
  if (messages.length < 3) {
    return { didFold: false, stage: 0, usagePercent: 0, messages }
  }

  const contextWindow = getEstimatedContextWindow(model)
  const estimatedUsage = estimateTokens(messages)
  const usagePercent = (estimatedUsage / contextWindow) * 100

  const stage = determineStage(usagePercent)
  if (stage <= currentStage) {
    return { didFold: false, stage: currentStage, usagePercent, messages }
  }

  return applyStage(stage, messages, model, usagePercent)
}

/**
 * Determine which stage is appropriate for the given usage percentage.
 */
export function determineStage(usagePercent: number): number {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (usagePercent >= STAGES[i]!.threshold) return i
  }
  return 0
}

/**
 * Reset module-level state (for testing or session reset).
 */
export function resetStagedFoldingState(): void {
  currentStage = 0
  stageApplicationCount.clear()
}

/**
 * Get current stage for diagnostics.
 */
export function getCurrentStage(): number {
  return currentStage
}

// ============================================================
// Internal
// ============================================================

async function applyStage(
  stage: number,
  messages: BetaMessageParam[],
  model: string,
  usagePercent: number,
): Promise<StagedFoldResult> {
  const def = STAGES[stage]
  if (!def) {
    return { didFold: false, stage: 0, usagePercent, messages }
  }

  const applyCount = stageApplicationCount.get(stage) ?? 0
  const maxApply = def.useLlm ? LLM_MAX_APPLICATIONS : MAX_APPLICATIONS_PER_STAGE
  if (applyCount >= maxApply) {
    return { didFold: false, stage: currentStage, usagePercent, messages }
  }

  let working = messages

  // Microcompact first (cheap, no API call)
  if (def.microcompact) {
    const microcompacted = microcompactToolResults(working)
    if (microcompacted !== working) {
      working = microcompacted
    }
  }

  // LLM-based semantic compaction
  if (def.useLlm && def.hotPairs > 0 && working.length > 6) {
    try {
      const llmResult = await llmCompact(working, { direction: 'up_to' })
      if (llmResult.didCompact) {
        working = llmResult.messages
      }
    } catch {
      // LLM failed — fall through to deterministic fallback
    }
  }

  // Deterministic fallback (used when LLM isn't configured or failed)
  if (!def.useLlm || def.keepPairs > 0) {
    const keep = def.keepPairs > 0 ? def.keepPairs : def.hotPairs
    if (keep > 0) {
      const compacted = compactMessages(working, { keepPairs: keep })
      if (compacted !== working) {
        working = compacted
      }
    }
  }

  // Record the transition
  currentStage = stage
  stageApplicationCount.set(stage, applyCount + 1)

  const didFold = working !== messages || stage > 0

  return { didFold, stage, usagePercent, messages: working }
}
