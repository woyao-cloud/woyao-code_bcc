/**
 * Prompt building utilities
 */

/**
 * Prepend bullet points with proper indentation
 */
export function prependBullets(lines: string[], indent = ''): string {
  return lines.map(l => `${indent}- ${l}`).join('\n')
}
