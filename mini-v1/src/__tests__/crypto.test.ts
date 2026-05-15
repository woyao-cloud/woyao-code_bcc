import { describe, expect, test } from 'bun:test'
import { randomUUID } from '../utils/crypto.js'

describe('randomUUID', () => {
  test('returns a string', () => {
    const uuid = randomUUID()
    expect(typeof uuid).toBe('string')
  })

  test('returns a valid UUID v4 format', () => {
    const uuid = randomUUID()
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(uuidRegex.test(uuid)).toBe(true)
  })

  test('generates unique values', () => {
    const uuids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      uuids.add(randomUUID())
    }
    expect(uuids.size).toBe(100)
  })

  test('returns 36-character string', () => {
    const uuid = randomUUID()
    expect(uuid.length).toBe(36)
  })
})
