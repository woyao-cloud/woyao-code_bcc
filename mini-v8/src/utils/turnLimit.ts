/**
 * Turn limit management system
 * Provides intelligent turn limiting with warnings and callbacks
 */

// ============================================================================
// Types
// ============================================================================

export interface TurnLimitConfig {
  maxTurns: number
  warningThresholds?: number[] // Percentage thresholds for warnings (0-100)
  warningInterval?: number // Warn every N turns after threshold
  onWarning?: (turnCount: number, maxTurns: number) => void
  onLimitReached?: (turnCount: number, maxTurns: number) => void
}

export interface TurnLimitState {
  turnCount: number
  maxTurns: number
  warningsIssued: number[]
}

export interface TurnLimitResult {
  shouldContinue: boolean
  isWarning: boolean
  isLimitReached: boolean
  turnCount: number
  remainingTurns: number
  percentageUsed: number
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_MAX_TURNS = 50
export const DEFAULT_WARNING_THRESHOLDS = [50, 70, 80, 90] // Percentage thresholds
export const DEFAULT_WARNING_INTERVAL = 5

// ============================================================================
// Turn Limit Manager
// ============================================================================

export class TurnLimitManager {
  private state: TurnLimitState
  private config: TurnLimitConfig

  constructor(config: Partial<TurnLimitConfig> = {}) {
    this.config = {
      maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
      warningThresholds: config.warningThresholds ?? DEFAULT_WARNING_THRESHOLDS,
      warningInterval: config.warningInterval ?? DEFAULT_WARNING_INTERVAL,
      onWarning: config.onWarning,
      onLimitReached: config.onLimitReached,
    }

    this.state = {
      turnCount: 0,
      maxTurns: this.config.maxTurns,
      warningsIssued: [],
    }
  }

  /**
   * Increment turn count and check limits
   */
  increment(): TurnLimitResult {
    this.state.turnCount++
    return this.check()
  }

  /**
   * Check current turn limit status without incrementing
   */
  check(): TurnLimitResult {
    const { turnCount, maxTurns } = this.state
    const percentageUsed = Math.round((turnCount / maxTurns) * 100)
    const remainingTurns = Math.max(0, maxTurns - turnCount)
    const isLimitReached = turnCount > maxTurns

    // Check for warnings
    let isWarning = false
    for (const threshold of this.config.warningThresholds) {
      const thresholdTurn = Math.floor((threshold / 100) * maxTurns)

      // Check if we've reached this threshold
      const reachedThreshold = turnCount >= thresholdTurn

      // Check if we should warn (either first time reaching threshold, or at interval)
      const shouldWarn =
        reachedThreshold &&
        (!this.state.warningsIssued.includes(threshold) ||
          (this.config.warningInterval !== undefined &&
            (turnCount - thresholdTurn) % this.config.warningInterval === 0))

      if (shouldWarn) {
        isWarning = true
        if (!this.state.warningsIssued.includes(threshold)) {
          this.state.warningsIssued.push(threshold)
        }

        // Call warning callback
        if (this.config.onWarning) {
          this.config.onWarning(turnCount, maxTurns)
        }
        break // Only warn for the highest threshold reached
      }
    }

    // Call limit reached callback
    if (isLimitReached && this.config.onLimitReached) {
      this.config.onLimitReached(turnCount, maxTurns)
    }

    return {
      shouldContinue: !isLimitReached,
      isWarning,
      isLimitReached,
      turnCount,
      remainingTurns,
      percentageUsed,
    }
  }

  /**
   * Get current turn count
   */
  getTurnCount(): number {
    return this.state.turnCount
  }

  /**
   * Get remaining turns
   */
  getRemainingTurns(): number {
    return Math.max(0, this.state.maxTurns - this.state.turnCount)
  }

  /**
   * Get percentage of turns used
   */
  getPercentageUsed(): number {
    return Math.round((this.state.turnCount / this.state.maxTurns) * 100)
  }

  /**
   * Reset turn count
   */
  reset(): void {
    this.state = {
      turnCount: 0,
      maxTurns: this.state.maxTurns,
      warningsIssued: [],
    }
  }

  /**
   * Update maxTurns dynamically
   */
  updateMaxTurns(newMaxTurns: number): void {
    this.state.maxTurns = newMaxTurns
    this.config.maxTurns = newMaxTurns
  }

  /**
   * Check if we're approaching the limit (within warning threshold)
   */
  isApproachingLimit(): boolean {
    const percentageUsed = this.getPercentageUsed()
    return this.config.warningThresholds.some(
      threshold => percentageUsed >= threshold,
    )
  }

  /**
   * Get warning message for current state
   */
  getWarningMessage(): string | null {
    const { turnCount, maxTurns } = this.state
    const percentageUsed = this.getPercentageUsed()

    if (turnCount > maxTurns) {
      return `Turn limit (${maxTurns}) reached. Consider breaking the task into smaller steps or increasing the limit.`
    }

    // Find the highest threshold reached
    const reachedThresholds = this.config.warningThresholds.filter(
      threshold => percentageUsed >= threshold,
    )

    if (reachedThresholds.length > 0) {
      const highestThreshold = Math.max(...reachedThresholds)
      return `[Warning] Approaching turn limit: ${turnCount}/${maxTurns} (${highestThreshold}%)`
    }

    return null
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a default TurnLimitManager with standard console warnings
 */
export function createDefaultTurnLimitManager(
  maxTurns?: number,
): TurnLimitManager {
  return new TurnLimitManager({
    maxTurns: maxTurns ?? DEFAULT_MAX_TURNS,
    onWarning: (turnCount, maxTurns) => {
      const percentage = Math.round((turnCount / maxTurns) * 100)
      process.stderr.write(
        `\n  [Warning] Approaching turn limit: ${turnCount}/${maxTurns} (${percentage}%)\n`,
      )
    },
    onLimitReached: (turnCount, maxTurns) => {
      process.stderr.write(
        `\nTurn limit (${maxTurns}) reached. Consider using /model command to change settings, increasing the --max-turns parameter, or breaking the task into smaller steps.\n`,
      )
    },
  })
}

/**
 * Calculate ETA or progress estimate
 */
export function calculateTurnProgress(
  turnCount: number,
  maxTurns: number,
  startTime?: number,
): {
  percentage: number
  remainingTurns: number
  etaSeconds?: number
  avgTimePerTurnMs?: number
} {
  const percentage = Math.round((turnCount / maxTurns) * 100)
  const remainingTurns = Math.max(0, maxTurns - turnCount)

  let etaSeconds: number | undefined
  let avgTimePerTurnMs: number | undefined

  if (startTime && turnCount > 0) {
    const elapsedMs = Date.now() - startTime
    avgTimePerTurnMs = elapsedMs / turnCount
    etaSeconds = Math.round((remainingTurns * avgTimePerTurnMs) / 1000)
  }

  return {
    percentage,
    remainingTurns,
    etaSeconds,
    avgTimePerTurnMs,
  }
}

/**
 * Format turn limit status for display
 */
export function formatTurnStatus(
  turnCount: number,
  maxTurns: number,
  startTime?: number,
): string {
  const progress = calculateTurnProgress(turnCount, maxTurns, startTime)
  const parts: string[] = []

  parts.push(`Turn: ${turnCount}/${maxTurns}`)
  parts.push(`(${progress.percentage}%)`)

  if (progress.etaSeconds !== undefined) {
    const etaMinutes = Math.floor(progress.etaSeconds / 60)
    const etaSecs = progress.etaSeconds % 60
    if (etaMinutes > 0) {
      parts.push(`ETA: ${etaMinutes}m ${etaSecs}s`)
    } else {
      parts.push(`ETA: ${etaSecs}s`)
    }
  }

  if (progress.avgTimePerTurnMs !== undefined) {
    parts.push(`(${progress.avgTimePerTurnMs.toFixed(0)}ms/turn)`)
  }

  return parts.join(' ')
}
