import { randomUUID } from 'crypto'

/**
 * Generate a random UUID using Node.js crypto
 */
export function generateUUID(): string {
  return randomUUID()
}

export { randomUUID }
