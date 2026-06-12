/**
 * Enhanced logging utility with in-memory log storage.
 * ALS-aware: log output automatically includes agent context prefix
 * when running inside an agent (via AsyncLocalStorage).
 */

import { getAgentLogPrefix } from './agentContext.js'

// ============================================================================
// Log Types
// ============================================================================

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  message: string
  error?: Error
  metadata?: Record<string, unknown>
}

// ============================================================================
// Log Storage
// ============================================================================

const MAX_IN_MEMORY_LOGS = 100
const inMemoryLogs: LogEntry[] = []
let logIdCounter = 0

function generateLogId(): string {
  return `log-${++logIdCounter}-${Date.now()}`
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function addLogEntry(
  level: LogLevel,
  message: string,
  error?: unknown,
  metadata?: Record<string, unknown>,
): LogEntry {
  const entry: LogEntry = {
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    level,
    message,
    error: error instanceof Error ? error : undefined,
    metadata,
  }

  inMemoryLogs.push(entry)

  // Trim old logs
  if (inMemoryLogs.length > MAX_IN_MEMORY_LOGS) {
    inMemoryLogs.shift()
  }

  return entry
}

// ============================================================================
// Log Functions
// ============================================================================

export function logError(
  message: string,
  error?: unknown,
  metadata?: Record<string, unknown>,
): LogEntry {
  const prefix = getAgentLogPrefix()
  const entry = addLogEntry('error', message, error, {
    ...metadata,
    agent: prefix,
  })
  const msg = error ? `${message}: ${formatError(error)}` : message
  process.stderr.write(`${prefix} [ERROR] ${msg}\n`)

  // Also log stack trace if available
  if (error instanceof Error && error.stack) {
    process.stderr.write(`[ERROR] Stack: ${error.stack}\n`)
  }

  return entry
}

export function logWarning(
  message: string,
  metadata?: Record<string, unknown>,
): LogEntry {
  const prefix = getAgentLogPrefix()
  const entry = addLogEntry('warn', message, undefined, {
    ...metadata,
    agent: prefix,
  })
  process.stderr.write(`${prefix} [WARN] ${message}\n`)
  return entry
}

export function logInfo(
  message: string,
  metadata?: Record<string, unknown>,
): LogEntry {
  const prefix = getAgentLogPrefix()
  const entry = addLogEntry('info', message, undefined, {
    ...metadata,
    agent: prefix,
  })
  process.stderr.write(`${prefix} [INFO] ${message}\n`)
  return entry
}

export function logDebug(
  message: string,
  metadata?: Record<string, unknown>,
): LogEntry | null {
  // Debug logging - only in verbose mode
  if (process.env.CLAUDE_CODE_DEBUG) {
    const prefix = getAgentLogPrefix()
    const entry = addLogEntry('debug', message, undefined, {
      ...metadata,
      agent: prefix,
    })
    process.stderr.write(`${prefix} [DEBUG] ${message}\n`)
    return entry
  }
  return null
}

// ============================================================================
// Log Query Functions
// ============================================================================

/**
 * Get all in-memory logs
 */
export function getLogs(limit?: number, level?: LogLevel): LogEntry[] {
  let logs = [...inMemoryLogs]

  // Filter by level
  if (level) {
    logs = logs.filter(log => log.level === level)
  }

  // Apply limit
  if (limit && limit > 0) {
    logs = logs.slice(-limit)
  }

  return logs
}

/**
 * Get error logs
 */
export function getErrorLogs(limit?: number): LogEntry[] {
  return getLogs(limit, 'error')
}

/**
 * Get warning logs
 */
export function getWarningLogs(limit?: number): LogEntry[] {
  return getLogs(limit, 'warn')
}

/**
 * Get info logs
 */
export function getInfoLogs(limit?: number): LogEntry[] {
  return getLogs(limit, 'info')
}

/**
 * Get debug logs
 */
export function getDebugLogs(limit?: number): LogEntry[] {
  return getLogs(limit, 'debug')
}

/**
 * Get logs by date range
 */
export function getLogsByDateRange(
  startDate: Date,
  endDate: Date,
  level?: LogLevel,
): LogEntry[] {
  let logs = getLogs(undefined, level)
  const start = startDate.getTime()
  const end = endDate.getTime()

  return logs.filter(log => {
    const logTime = new Date(log.timestamp).getTime()
    return logTime >= start && logTime <= end
  })
}

/**
 * Search logs by message content
 */
export function searchLogs(query: string, level?: LogLevel): LogEntry[] {
  const logs = getLogs(undefined, level)
  const lowerQuery = query.toLowerCase()
  return logs.filter(
    log =>
      log.message.toLowerCase().includes(lowerQuery) ||
      log.error?.message?.toLowerCase().includes(lowerQuery),
  )
}

/**
 * Format logs as text for display
 */
export function formatLogs(
  logs: LogEntry[],
  includeStack: boolean = false,
): string {
  return logs
    .map(log => {
      let line = `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
      if (log.error) {
        line += `: ${log.error.message}`
        if (includeStack && log.error.stack) {
          line += `\n${log.error.stack}`
        }
      }
      if (log.metadata) {
        line += `\n  Metadata: ${JSON.stringify(log.metadata)}`
      }
      return line
    })
    .join('\n')
}

/**
 * Clear all in-memory logs (for testing)
 */
export function clearLogs(): void {
  inMemoryLogs.length = 0
}

/**
 * Get log count by level
 */
export function getLogStats(): Record<LogLevel, number> {
  const stats = {
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
  }

  for (const log of inMemoryLogs) {
    stats[log.level]++
  }

  return stats
}

// ============================================================================
// Performance Monitoring
// ============================================================================

export interface TimingResult {
  durationMs: number
  message: string
}

/**
 * Log timing for async operations
 */
export async function logTiming<T>(
  operationName: string,
  fn: () => Promise<T>,
  warnThresholdMs: number = 5000,
): Promise<T> {
  const startTime = Date.now()
  logDebug(`Starting operation: ${operationName}`)

  try {
    const result = await fn()
    const duration = Date.now() - startTime

    if (duration >= warnThresholdMs) {
      logWarning(`Slow operation: ${operationName} took ${duration}ms`, {
        duration,
      })
    } else {
      logDebug(`Completed operation: ${operationName} in ${duration}ms`, {
        duration,
      })
    }

    return result
  } catch (error) {
    const duration = Date.now() - startTime
    logError(`Failed operation: ${operationName} after ${duration}ms`, error, {
      duration,
    })
    throw error
  }
}

/**
 * Create a timing wrapper for synchronous operations
 */
export function logTimingSync<T>(
  operationName: string,
  fn: () => T,
  warnThresholdMs: number = 1000,
): T {
  const startTime = Date.now()
  logDebug(`Starting sync operation: ${operationName}`)

  try {
    const result = fn()
    const duration = Date.now() - startTime

    if (duration >= warnThresholdMs) {
      logWarning(`Slow sync operation: ${operationName} took ${duration}ms`, {
        duration,
      })
    } else {
      logDebug(`Completed sync operation: ${operationName} in ${duration}ms`, {
        duration,
      })
    }

    return result
  } catch (error) {
    const duration = Date.now() - startTime
    logError(
      `Failed sync operation: ${operationName} after ${duration}ms`,
      error,
      { duration },
    )
    throw error
  }
}
