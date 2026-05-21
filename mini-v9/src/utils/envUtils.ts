/**
 * Check if an environment variable is truthy
 */
export function isEnvTruthy(value: string | undefined): boolean {
  if (!value) return false
  const lower = value.toLowerCase()
  return lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on'
}

/**
 * Check if running in bare mode (minimal output)
 */
export function isBareMode(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_BARE_MODE)
}
