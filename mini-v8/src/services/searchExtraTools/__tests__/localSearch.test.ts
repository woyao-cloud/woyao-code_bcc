import { describe, test, expect } from 'bun:test'
import {
  tokenize,
  stem,
  tokenizeAndStem,
  computeWeightedTf,
  computeIdf,
  cosineSimilarity,
} from '../localSearch.js'

describe('tokenize', () => {
  test('splits English text into words', () => {
    const result = tokenize('hello world')
    expect(result).toEqual(['hello', 'world'])
  })

  test('filters out stop words', () => {
    const result = tokenize('the cat is on the mat')
    expect(result).toEqual(['cat', 'mat'])
  })

  test('normalizes to lower case', () => {
    const result = tokenize('Hello WORLD')
    expect(result).toEqual(['hello', 'world'])
  })

  test('handles empty string', () => {
    const result = tokenize('')
    expect(result).toEqual([])
  })

  test('filters hyphenated word prefixes/suffixes', () => {
    const result = tokenize('-leading')
    expect(result).toEqual(['leading'])
  })

  test('keeps numbers in words', () => {
    const result = tokenize('test123 hello')
    expect(result).toEqual(['test123', 'hello'])
  })

  test('tokenizes CJK text as bigrams', () => {
    const result = tokenize('你好世界')
    expect(result).toEqual(['你好', '好世', '世界'])
  })
})

describe('stem', () => {
  test('stems -ing suffix', () => {
    expect(stem('running')).toBe('runn')
    expect(stem('testing')).toBe('test')
  })

  test('stems -tion suffix', () => {
    expect(stem('execution')).toBe('execu')
  })

  test('stems -ness suffix', () => {
    expect(stem('happiness')).toBe('happi')
  })

  test('stems -ment suffix', () => {
    expect(stem('deployment')).toBe('deploy')
  })

  test('stems -er suffix', () => {
    expect(stem('runner')).toBe('runn')
  })

  test('stems -es suffix', () => {
    expect(stem('boxes')).toBe('box')
  })

  test('stems -s suffix', () => {
    expect(stem('cats')).toBe('cat')
  })

  test('does not stem -ss suffix', () => {
    expect(stem('pass')).toBe('pass')
  })

  test('stems -ed suffix', () => {
    expect(stem('tested')).toBe('test')
  })

  test('stems -ly suffix', () => {
    expect(stem('quickly')).toBe('quick')
  })

  test('respects minimum length for stemming', () => {
    // 'doing' has 5 chars, condition is >5, so it stays unchanged
    expect(stem('doing')).toBe('doing')
    expect(stem('run')).toBe('run')
  })

  test('does not stem CJK characters', () => {
    expect(stem('你好')).toBe('你好')
  })
})

describe('tokenizeAndStem', () => {
  test('tokenizes and stems combined', () => {
    const result = tokenizeAndStem('running tests is testing')
    expect(result).toEqual(['runn', 'test', 'test'])
  })
})

describe('computeWeightedTf', () => {
  test('computes weighted term frequency for single field', () => {
    const result = computeWeightedTf([
      { tokens: tokenizeAndStem('running testing cron'), weight: 3.0 },
    ])
    expect(result.get('cron')).toBeGreaterThan(0)
    expect(result.get('runn')).toBeGreaterThan(0)
    expect(result.get('test')).toBeGreaterThan(0)
  })

  test('gives higher weight to higher-weighted fields', () => {
    const result = computeWeightedTf([
      { tokens: tokenizeAndStem('cron'), weight: 3.0 },
      { tokens: tokenizeAndStem('cron'), weight: 1.0 },
    ])
    // max weight should be 3.0
    const val = result.get('cron') ?? 0
    expect(Math.abs(val - 3.0)).toBeLessThan(0.001)
  })
})

describe('computeIdf', () => {
  test('computes IDF for a set of documents', () => {
    const index = [
      { tokens: tokenizeAndStem('create cron job') },
      { tokens: tokenizeAndStem('delete job') },
      { tokens: tokenizeAndStem('list jobs') },
    ]
    const idf = computeIdf(index)
    // 'cron' appears in 1 of 3 docs → log(3/1)
    // 'job' appears in all 3 docs → log(3/3) = 0
    expect(Math.abs((idf.get('job') ?? 0) - Math.log(3 / 3))).toBeLessThan(
      0.001,
    )
    expect(Math.abs((idf.get('cron') ?? 0) - Math.log(3 / 1))).toBeLessThan(
      0.001,
    )
  })
})

describe('cosineSimilarity', () => {
  test('returns 1 for identical vectors', () => {
    const vec = new Map([
      ['a', 1],
      ['b', 2],
    ])
    expect(Math.abs(cosineSimilarity(vec, vec) - 1)).toBeLessThan(0.001)
  })

  test('returns 0 for orthogonal vectors', () => {
    const a = new Map([['x', 1]])
    const b = new Map([['y', 2]])
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  test('returns 0 for empty vectors', () => {
    expect(cosineSimilarity(new Map(), new Map())).toBe(0)
  })
})
