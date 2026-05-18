import { describe, test, expect } from 'bun:test'
import {
  calculateMemoryAge,
  isMemoryStale,
} from '../services/memory/memoryAge.js'

describe('memoryAge', () => {
  test('calculateMemoryAge returns days since modification', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    expect(calculateMemoryAge(twoDaysAgo)).toBe(2)
  })

  test('isMemoryStale returns true for old files', () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    expect(isMemoryStale(old, 90)).toBe(true)
  })

  test('isMemoryStale returns false for recent files', () => {
    expect(isMemoryStale(new Date(), 90)).toBe(false)
  })
})
