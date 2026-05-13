/**
 * Common constants for the mini CLI
 */

export function getLocalISODate(): string {
  return new Date().toISOString()
}

export function getLocalDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
