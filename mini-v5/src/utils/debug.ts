/**
 * Debug logging utility ¡ª only outputs in verbose mode
 */
const isVerbose = process.env.CLAUDE_CODE_VERBOSE === '1' || process.env.DEBUG === '1';

export function logDebug(message: string): void {
  if (isVerbose) {
    process.stderr.write(`[DEBUG] ${message}\n`);
  }
}

export function logForDebugging(label: string, data: unknown): void {
  if (isVerbose) {
    process.stderr.write(`[DEBUG] ${label}: ${JSON.stringify(data, null, 2)}\n`);
  }
}
