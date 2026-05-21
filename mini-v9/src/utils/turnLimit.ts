/**
 * Turn limit management system
 * Provides intelligent turn limiting with warnings and callbacks
 */

// ============================================================================
// Types
// ============================================================================

export interface TurnLimitConfig {
  maxTurns: number
  warningThresholds?: number[]
  warningInterval?: number
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
export const DEFAULT_WARNING_THRESHOLDS = [50, 70, 80, 90]
export const DEFAULT_WARNING_INTERVAL = 5

// ============================================================================
// Turn Limit Manager
// ============================================================================

export class TurnLimitManager {
  private state: TurnLimitState
  private maxTurns: number
  private warningThresholds: number[]
  private warningInterval: number
  private onWarning?: (turnCount: number, maxTurns: number) => void
  private onLimitReached?: (turnCount: number, maxTurns: number) => void

  constructor(config?: Partial<TurnLimitConfig>) {
    this.maxTurns = config?.maxTurns ?? DEFAULT_MAX_TURNS
    this.warningThresholds =
      config?.warningThresholds ?? DEFAULT_WARNING_THRESHOLDS
    this.warningInterval = config?.warningInterval ?? DEFAULT_WARNING_INTERVAL
    this.onWarning = config?.onWarning
    this.onLimitReached = config?.onLimitReached

    this.state = {
      turnCount: 0,
      maxTurns: this.maxTurns,
      warningsIssued: [],
    }
  }

  increment(): TurnLimitResult {
    this.state.turnCount++
    return this.check()
  }

  check(): TurnLimitResult {
    const { turnCount, maxTurns } = this.state
    const percentageUsed = Math.round((turnCount / maxTurns) * 100)
    const remainingTurns = Math.max(0, maxTurns - turnCount)
    const isLimitReached = turnCount > maxTurns

    let isWarning = false

    for (const threshold of this.warningThresholds) {
      const thresholdTurn = Math.floor((threshold / 100) * maxTurns)
      const reachedThreshold = turnCount >= thresholdTurn
      const alreadyIssued = this.state.warningsIssued.includes(threshold)

      const shouldWarn =
        reachedThreshold &&
        (!alreadyIssued ||
          (turnCount - thresholdTurn) % this.warningInterval === 0)

      if (shouldWarn) {
        isWarning = true
        if (!alreadyIssued) {
          this.state.warningsIssued.push(threshold)
        }

        if (this.onWarning) {
          this.onWarning(turnCount, maxTurns)
        }
        break
      }
    }

    if (isLimitReached && this.onLimitReached) {
      this.onLimitReached(turnCount, maxTurns)
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

  getTurnCount(): number {
    return this.state.turnCount
  }

  getRemainingTurns(): number {
    return Math.max(0, this.state.maxTurns - this.state.turnCount)
  }

  getPercentageUsed(): number {
    return Math.round((this.state.turnCount / this.state.maxTurns) * 100)
  }

  reset(): void {
    this.state = {
      turnCount: 0,
      maxTurns: this.state.maxTurns,
      warningsIssued: [],
    }
  }

  updateMaxTurns(newMaxTurns: number): void {
    this.state.maxTurns = newMaxTurns
    this.maxTurns = newMaxTurns
  }

  isApproachingLimit(): boolean {
    const percentageUsed = this.getPercentageUsed()
    return this.warningThresholds.some(threshold => percentageUsed >= threshold)
  }

  getWarningMessage(): string | null {
    const { turnCount, maxTurns } = this.state
    const percentageUsed = this.getPercentageUsed()

    if (turnCount > maxTurns) {
      return `Turn limit (${maxTurns}) reached. Consider breaking the task into smaller steps or increasing the limit.`
    }

    const reachedThresholds = this.warningThresholds.filter(
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
