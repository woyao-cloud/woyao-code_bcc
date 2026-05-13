import { describe, expect, test } from 'bun:test'
import { errorMessage } from '../utils/errors.js'

describe('errorMessage', () => {
  test('returns message from Error', () => {
    expect(errorMessage(new Error('hello'))).toBe('hello')
  })

  test('returns string as-is', () => {
    expect(errorMessage('plain string')).toBe('plain string')
  })

  test('converts object to string', () => {
    expect(typeof errorMessage({ code: 500 })).toBe('string')
  })

  test('converts null to string', () => {
    expect(errorMessage(null)).toBe('null')
  })

  test('converts number to string', () => {
    expect(errorMessage(42)).toBe('42')
  })

  test('handles undefined', () => {
    expect(errorMessage(undefined)).toBe('undefined')
  })
})
