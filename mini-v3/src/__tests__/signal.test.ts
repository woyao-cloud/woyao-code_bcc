import { describe, expect, test } from 'bun:test'
import { createSignal } from '../utils/signal.js'

describe('createSignal', () => {
  test('holds initial value', () => {
    const s = createSignal(42)
    expect(s.get()).toBe(42)
  })

  test('updates value via set', () => {
    const s = createSignal('hello')
    s.set('world')
    expect(s.get()).toBe('world')
  })

  test('notifies subscribers on set', () => {
    const s = createSignal(0)
    let notified = false
    s.subscribe(() => {
      notified = true
    })
    s.set(1)
    expect(notified).toBe(true)
  })

  test('passes new value to subscribers', () => {
    const s = createSignal(0)
    let received = 0
    s.subscribe(v => {
      received = v
    })
    s.set(99)
    expect(received).toBe(99)
  })

  test('unsubscribe stops notifications', () => {
    const s = createSignal(0)
    let count = 0
    const unsub = s.subscribe(() => {
      count++
    })
    s.set(1)
    unsub()
    s.set(2)
    expect(count).toBe(1)
  })

  test('supports multiple subscribers', () => {
    const s = createSignal(0)
    let a = 0,
      b = 0
    s.subscribe(() => {
      a++
    })
    s.subscribe(() => {
      b++
    })
    s.set(1)
    expect(a).toBe(1)
    expect(b).toBe(1)
  })

  test('works with objects', () => {
    const s = createSignal<Record<string, unknown>>({ name: 'test' })
    expect(s.get()).toEqual({ name: 'test' })
    s.set({ name: 'updated' })
    expect(s.get()).toEqual({ name: 'updated' })
  })

  test('works with arrays', () => {
    const s = createSignal([1, 2, 3])
    expect(s.get()).toEqual([1, 2, 3])
  })

  test('get returns current value without side effects', () => {
    const s = createSignal(5)
    expect(s.get()).toBe(5)
    expect(s.get()).toBe(5)
  })
})
