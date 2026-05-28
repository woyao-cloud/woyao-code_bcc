/**
 * Token Budget system — per-session output token limits with continuation
 * nudges and diminishing returns detection.
 *
 * Tracks cumulative output tokens across turns and decides when to nudge
 * the model to continue vs. stop (diminishing returns detected).
 */

// ============================================================
// Constants
// ============================================================

/** Stop when total turn tokens exceed 90% of budget */
const COMPLETION_THRESHOLD = 0.9

/** Below this token delta, consider output as diminishing returns */
const DIMINISHING_THRESHOLD = 500

// ============================================================
// Types
// ============================================================

export interface BudgetTracker {
  continuationCount: number
  lastDeltaTokens: number
  lastGlobalTurnTokens: number
  startedAt: number
}

export interface ContinueDecision {
  action: 'continue'
  nudgeMessage: string
  continuationCount: number
  pct: number
  turnTokens: number
  budget: number
}

export interface CompletionEvent {
  continuationCount: number
  pct: number
  turnTokens: number
  budget: number
  diminishingReturns: boolean
  durationMs: number
}

export interface StopDecision {
  action: 'stop'
  completionEvent: CompletionEvent | null
}

export type TokenBudgetDecision = ContinueDecision | StopDecision

// ============================================================
// Public API
// ============================================================

/**
 * Create a new budget tracker for a session.
 */
export function createBudgetTracker(): BudgetTracker {
  return {
    continuationCount: 0,
    lastDeltaTokens: 0,
    lastGlobalTurnTokens: 0,
    startedAt: Date.now(),
  }
}

/**
 * Check whether the token budget allows continuation.
 *
 * @param tracker - Budget tracker state (mutated in place)
 * @param agentId - If set (agent session), budget is skipped
 * @param budget - Token budget in tokens (null = no limit)
 * @param globalTurnTokens - Cumulative output tokens used so far
 * @returns ContinueDecision with nudge message, or StopDecision
 */
export function checkTokenBudget(
  tracker: BudgetTracker,
  agentId: string | undefined,
  budget: number | null,
  globalTurnTokens: number,
): TokenBudgetDecision {
  // Skip budget enforcement for agent sessions or when no budget is set
  if (agentId || budget === null || budget <= 0) {
    return { action: 'stop', completionEvent: null }
  }

  const turnTokens = globalTurnTokens
  const pct = Math.round((turnTokens / budget) * 100)
  const deltaSinceLastCheck = globalTurnTokens - tracker.lastGlobalTurnTokens

  const isDiminishing =
    tracker.continuationCount >= 3 &&
    deltaSinceLastCheck < DIMINISHING_THRESHOLD &&
    tracker.lastDeltaTokens < DIMINISHING_THRESHOLD

  if (!isDiminishing && turnTokens < budget * COMPLETION_THRESHOLD) {
    tracker.continuationCount++
    tracker.lastDeltaTokens = deltaSinceLastCheck
    tracker.lastGlobalTurnTokens = globalTurnTokens
    return {
      action: 'continue',
      nudgeMessage: getBudgetContinuationMessage(pct, turnTokens, budget),
      continuationCount: tracker.continuationCount,
      pct,
      turnTokens,
      budget,
    }
  }

  if (isDiminishing || tracker.continuationCount > 0) {
    return {
      action: 'stop',
      completionEvent: {
        continuationCount: tracker.continuationCount,
        pct,
        turnTokens,
        budget,
        diminishingReturns: isDiminishing,
        durationMs: Date.now() - tracker.startedAt,
      },
    }
  }

  return { action: 'stop', completionEvent: null }
}

// ============================================================
// Internal
// ============================================================

function getBudgetContinuationMessage(
  pct: number,
  turnTokens: number,
  budget: number,
): string {
  const fmt = (n: number): string => new Intl.NumberFormat('en-US').format(n)
  return `Stopped at ${pct}% of token target (${fmt(turnTokens)} / ${fmt(budget)}). Keep working — do not summarize.`
}
