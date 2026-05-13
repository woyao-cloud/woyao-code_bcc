import { describe, expect, test, beforeEach } from 'bun:test'
import {
  isInPlanMode,
  getPlanResults,
  enterPlanMode,
  leavePlanMode,
  addPlanResult,
} from '../services/planMode.js'

beforeEach(() => {
  leavePlanMode()
})

describe('planMode', () => {
  test('starts not in plan mode', () => {
    expect(isInPlanMode()).toBe(false)
  })

  test('enterPlanMode sets mode to true', () => {
    enterPlanMode()
    expect(isInPlanMode()).toBe(true)
  })

  test('leavePlanMode sets mode to false', () => {
    enterPlanMode()
    leavePlanMode()
    expect(isInPlanMode()).toBe(false)
  })

  test('enterPlanMode clears results', () => {
    addPlanResult('old')
    enterPlanMode()
    expect(getPlanResults().length).toBe(0)
  })

  test('addPlanResult appends results', () => {
    addPlanResult('step 1')
    addPlanResult('step 2')
    expect(getPlanResults()).toEqual(['step 1', 'step 2'])
  })
})
