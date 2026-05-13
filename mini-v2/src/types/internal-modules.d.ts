declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void
  export function test(name: string, fn: () => void | Promise<void>): void
  export function expect<T>(actual: T): {
    toBe(expected: T): void
    toEqual(expected: T): void
    toContain(expected: string): void
    toBeDefined(): void
    toBeUndefined(): void
    toBeNull(): void
    toBeInstanceOf(constructor: new (...args: never[]) => unknown): void
    toHaveProperty(name: string, value?: unknown): void
    toBeGreaterThan(n: number): void
    toBeGreaterThanOrEqual(n: number): void
    toBeLessThan(n: number): void
    toBeLessThanOrEqual(n: number): void
    not: {
      toBe(expected: T): void
      toContain(expected: string): void
      toEqual(expected: T): void
    }
  }
  export function beforeEach(fn: () => void): void
  export function afterEach(fn: () => void): void
  export function beforeAll(fn: () => void): void
  export function afterAll(fn: () => void): void
  export const mock: unknown
}
