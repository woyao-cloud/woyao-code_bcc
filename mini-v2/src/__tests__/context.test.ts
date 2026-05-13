import { describe, expect, test } from 'bun:test'
import { getSystemContext } from '../context.js'

describe('getSystemContext', () => {
  test('returns a non-empty string', async () => {
    const ctx = await getSystemContext()
    expect(typeof ctx).toBe('string')
    expect(ctx.length).toBeGreaterThan(0)
  })

  test('contains current date', async () => {
    const ctx = await getSystemContext()
    // Should contain a date in YYYY-MM-DD format
    expect(ctx).toContain('Current date:')
  })

  test('contains working directory', async () => {
    const ctx = await getSystemContext()
    expect(ctx).toContain('Working directory:')
  })

  test('does not throw', async () => {
    let threw = false
    try {
      await getSystemContext()
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })
})
