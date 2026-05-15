import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  TurnLimitManager,
  createDefaultTurnLimitManager,
  calculateTurnProgress,
  formatTurnStatus,
  DEFAULT_MAX_TURNS,
} from '../utils/turnLimit'

describe('TurnLimitManager', () => {
  test('should initialize with default maxTurns', () => {
    const manager = new TurnLimitManager()
    expect(manager.getTurnCount()).toBe(0)
    expect(manager.getRemainingTurns()).toBe(DEFAULT_MAX_TURNS)
    expect(manager.getPercentageUsed()).toBe(0)
  })

  test('should initialize with custom maxTurns', () => {
    const customMaxTurns = 20
    const manager = new TurnLimitManager({ maxTurns: customMaxTurns })
    expect(manager.getTurnCount()).toBe(0)
    expect(manager.getRemainingTurns()).toBe(customMaxTurns)
  })

  test('should increment turn count', () => {
    const manager = new TurnLimitManager({ maxTurns: 10 })
    expect(manager.getTurnCount()).toBe(0)

    const result1 = manager.increment()
    expect(result1.turnCount).toBe(1)
    expect(result1.shouldContinue).toBe(true)
    expect(result1.isLimitReached).toBe(false)

    const result2 = manager.increment()
    expect(result2.turnCount).toBe(2)
  })

  test('should return false when limit is reached', () => {
    const manager = new TurnLimitManager({ maxTurns: 3 })

    // Turn 1: should continue
    expect(manager.increment().shouldContinue).toBe(true)
    // Turn 2: should continue
    expect(manager.increment().shouldContinue).toBe(true)
    // Turn 3: should continue (at limit)
    expect(manager.increment().shouldContinue).toBe(true)
    // Turn 4: should stop (over limit)
    expect(manager.increment().shouldContinue).toBe(false)
    expect(manager.increment().isLimitReached).toBe(true)
  })

  test('should trigger warnings at thresholds', () => {
    const warningThresholds = [50, 80]
    const warnings: { turnCount: number; maxTurns: number }[] = []

    const manager = new TurnLimitManager({
      maxTurns: 10,
      warningThresholds,
      onWarning: (turnCount, maxTurns) => {
        warnings.push({ turnCount, maxTurns })
      },
    })

    // Turn 1-4: no warnings
    for (let i = 0; i < 4; i++) {
      manager.increment()
    }
    expect(warnings.length).toBe(0)

    // Turn 5: 50% threshold reached
    manager.increment()
    expect(warnings.length).toBe(1)
    expect(warnings[0].turnCount).toBe(5)

    // Turn 6-7: no new warnings
    manager.increment()
    manager.increment()
    expect(warnings.length).toBe(1)

    // Turn 8: 80% threshold reached
    manager.increment()
    expect(warnings.length).toBe(2)
    expect(warnings[1].turnCount).toBe(8)
  })

  test('should trigger onLimitReached callback', () => {
    let limitReached = false
    let reachedTurnCount = 0

    const manager = new TurnLimitManager({
      maxTurns: 3,
      onLimitReached: turnCount => {
        limitReached = true
        reachedTurnCount = turnCount
      },
    })

    // Before limit
    manager.increment()
    manager.increment()
    manager.increment()
    expect(limitReached).toBe(false)

    // Over limit
    manager.increment()
    expect(limitReached).toBe(true)
    expect(reachedTurnCount).toBe(4)
  })

  test('should reset turn count', () => {
    const manager = new TurnLimitManager({ maxTurns: 10 })

    manager.increment()
    manager.increment()
    expect(manager.getTurnCount()).toBe(2)

    manager.reset()
    expect(manager.getTurnCount()).toBe(0)
    expect(manager.getRemainingTurns()).toBe(10)
  })

  test('should update maxTurns dynamically', () => {
    const manager = new TurnLimitManager({ maxTurns: 5 })

    manager.increment()
    manager.increment()
    expect(manager.getRemainingTurns()).toBe(3)

    manager.updateMaxTurns(10)
    expect(manager.getRemainingTurns()).toBe(8)

    // Continue with new limit
    for (let i = 0; i < 8; i++) {
      manager.increment()
    }
    expect(manager.getTurnCount()).toBe(10)
    expect(manager.getRemainingTurns()).toBe(0)
    expect(manager.check().shouldContinue).toBe(true)

    // Now over the new limit
    manager.increment()
    expect(manager.check().shouldContinue).toBe(false)
  })

  test('should check if approaching limit', () => {
    const manager = new TurnLimitManager({
      maxTurns: 10,
      warningThresholds: [70],
    })

    // Below threshold
    for (let i = 0; i < 6; i++) {
      manager.increment()
    }
    expect(manager.isApproachingLimit()).toBe(false)

    // At threshold (70% of 10 = 7)
    manager.increment()
    expect(manager.isApproachingLimit()).toBe(true)
  })

  test('should get warning message', () => {
    const manager = new TurnLimitManager({ maxTurns: 10 })

    // No warning initially
    expect(manager.getWarningMessage()).toBe(null)

    // After incrementing past threshold
    for (let i = 0; i < 7; i++) {
      manager.increment()
    }
    const warning = manager.getWarningMessage()
    expect(warning).not.toBe(null)
    expect(warning).toContain('7/10')
  })

  test('should get limit reached message', () => {
    const manager = new TurnLimitManager({ maxTurns: 3 })

    // Go past limit
    for (let i = 0; i < 5; i++) {
      manager.increment()
    }

    const message = manager.getWarningMessage()
    expect(message).toContain('Turn limit (3) reached')
  })
})

describe('createDefaultTurnLimitManager', () => {
  test('should create manager with default settings', () => {
    const manager = createDefaultTurnLimitManager()
    expect(manager.getTurnCount()).toBe(0)
    expect(manager.getRemainingTurns()).toBe(DEFAULT_MAX_TURNS)
  })

  test('should create manager with custom maxTurns', () => {
    const customMaxTurns = 25
    const manager = createDefaultTurnLimitManager(customMaxTurns)
    expect(manager.getRemainingTurns()).toBe(customMaxTurns)
  })
})

describe('calculateTurnProgress', () => {
  test('should calculate progress correctly', () => {
    const progress = calculateTurnProgress(5, 10)
    expect(progress.percentage).toBe(50)
    expect(progress.remainingTurns).toBe(5)
    expect(progress.etaSeconds).toBeUndefined()
    expect(progress.avgTimePerTurnMs).toBeUndefined()
  })

  test('should calculate ETA when startTime is provided', () => {
    const startTime = Date.now() - 5000 // 5 seconds ago
    const progress = calculateTurnProgress(5, 10, startTime)

    expect(progress.percentage).toBe(50)
    expect(progress.remainingTurns).toBe(5)
    expect(progress.avgTimePerTurnMs!).toBeGreaterThanOrEqual(900)
    expect(progress.avgTimePerTurnMs!).toBeLessThanOrEqual(1100)
    expect(progress.etaSeconds!).toBeGreaterThanOrEqual(4)
    expect(progress.etaSeconds!).toBeLessThanOrEqual(6)
  })

  test('should handle edge case at limit', () => {
    const progress = calculateTurnProgress(10, 10)
    expect(progress.percentage).toBe(100)
    expect(progress.remainingTurns).toBe(0)
  })

  test('should handle edge case over limit', () => {
    const progress = calculateTurnProgress(15, 10)
    expect(progress.percentage).toBe(150)
    expect(progress.remainingTurns).toBe(0)
  })
})

describe('formatTurnStatus', () => {
  test('should format basic status', () => {
    const status = formatTurnStatus(3, 10)
    expect(status).toContain('Turn: 3/10')
    expect(status).toContain('(30%)')
  })

  test('should format status with ETA', () => {
    const startTime = Date.now() - 3000 // 3 seconds ago
    const status = formatTurnStatus(3, 10, startTime)
    expect(status).toContain('Turn: 3/10')
    expect(status).toContain('ETA')
    expect(status).toContain('ms/turn')
  })
})
