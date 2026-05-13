/**
 * Simple logging utility
 */
export function logError(message: string, error?: unknown): void {
  const msg =
    error instanceof Error
      ? `${message}: ${error.message}`
      : `${message}: ${String(error)}`
  process.stderr.write(`[ERROR] ${msg}\n`)
}

export function logWarning(message: string): void {
  process.stderr.write(`[WARN] ${message}\n`)
}

export function logInfo(message: string): void {
  process.stderr.write(`[INFO] ${message}\n`)
}

export function logDebug(message: string): void {
  // Debug logging - only in verbose mode
  if (process.env.CLAUDE_CODE_DEBUG) {
    process.stderr.write(`[DEBUG] ${message}\n`)
  }
}
