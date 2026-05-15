import { describe, expect, test } from 'bun:test'
import { count, uniq, last } from '../utils/array.js'

describe('count', () => {
  test('counts occurrences', () => {
    const result = count(['a', 'b', 'a', 'c', 'a'])
    expect(result.get('a')).toBe(3)
    expect(result.get('b')).toBe(1)
    expect(result.get('c')).toBe(1)
  })

  test('returns empty map for empty array', () => {
    const result = count([])
    expect(result.size).toBe(0)
  })

  test('works with numbers', () => {
    const result = count([1, 2, 1, 3, 2, 1])
    expect(result.get(1)).toBe(3)
    expect(result.get(2)).toBe(2)
    expect(result.get(3)).toBe(1)
  })

  test('returns undefined for non-existent key', () => {
    const result = count(['x'])
    expect(result.get('y')).toBeUndefined()
  })
})

describe('uniq', () => {
  test('removes duplicates', () => {
    expect(uniq([1, 2, 2, 3, 1])).toEqual([1, 2, 3])
  })

  test('returns same array if no duplicates', () => {
    expect(uniq([1, 2, 3])).toEqual([1, 2, 3])
  })

  test('returns empty array for empty input', () => {
    expect(uniq([])).toEqual([])
  })

  test('works with strings', () => {
    expect(uniq(['a', 'b', 'b'])).toEqual(['a', 'b'])
  })

  test('preserves insertion order', () => {
    expect(uniq(['c', 'a', 'b', 'a', 'c'])).toEqual(['c', 'a', 'b'])
  })
})

describe('last', () => {
  test('returns last element', () => {
    expect(last([1, 2, 3])).toBe(3)
  })

  test('returns undefined for empty array', () => {
    expect(last([])).toBeUndefined()
  })

  test('returns only element for single-element array', () => {
    expect(last([42])).toBe(42)
  })

  test('works with objects', () => {
    expect(last([{ x: 1 }, { x: 2 }])).toEqual({ x: 2 })
  })
})
