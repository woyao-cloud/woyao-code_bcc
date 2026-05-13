/**
 * Count occurrences of each value in an array
 */
export function count<T>(arr: T[]): Map<T, number> {
  const result = new Map<T, number>()
  for (const item of arr) {
    result.set(item, (result.get(item) ?? 0) + 1)
  }
  return result
}

/**
 * Get unique values from an array
 */
export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

/**
 * Get the last element of an array
 */
export function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1]
}
