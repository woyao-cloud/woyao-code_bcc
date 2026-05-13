/**
 * Simple reactive signal implementation
 */
export function createSignal<T>(initialValue: T) {
  let value = initialValue
  const listeners = new Set<(v: T) => void>()

  return {
    get(): T {
      return value
    },
    set(newValue: T): void {
      value = newValue
      for (const listener of listeners) {
        listener(value)
      }
    },
    subscribe(listener: (v: T) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
