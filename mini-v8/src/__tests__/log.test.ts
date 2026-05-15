import { describe, expect, test, beforeEach } from 'bun:test'
import {
  logError,
  logWarning,
  logInfo,
  logDebug,
  getLogs,
  getErrorLogs,
  getWarningLogs,
  getInfoLogs,
  getDebugLogs,
  getLogsByDateRange,
  searchLogs,
  formatLogs,
  clearLogs,
  getLogStats,
} from '../utils/log.js'

// Clear logs before each test
beforeEach(() => {
  clearLogs()
})

describe('logError', () => {
  test('logs an error and returns log entry', () => {
    const entry = logError('Something went wrong')
    expect(entry.level).toBe('error')
    expect(entry.message).toBe('Something went wrong')
  })

  test('logs an error with Error object', () => {
    const error = new Error('Test error')
    const entry = logError('Operation failed', error)
    expect(entry.error).toBeDefined()
    expect(entry.error?.message).toBe('Test error')
  })

  test('logs an error with metadata', () => {
    const entry = logError('Database error', undefined, { db: 'users' })
    expect(entry.metadata).toEqual({ agent: '[main]', db: 'users' })
  })
})

describe('logWarning', () => {
  test('logs a warning', () => {
    const entry = logWarning('This is a warning')
    expect(entry.level).toBe('warn')
    expect(entry.message).toBe('This is a warning')
  })
})

describe('logInfo', () => {
  test('logs info message', () => {
    const entry = logInfo('User logged in')
    expect(entry.level).toBe('info')
    expect(entry.message).toBe('User logged in')
  })
})

describe('logDebug', () => {
  test('logs debug message when debug mode is enabled', () => {
    process.env.CLAUDE_CODE_DEBUG = '1'
    const entry = logDebug('Debug info')
    expect(entry !== null).toBe(true)
    if (entry) {
      expect(entry.level).toBe('debug')
    }
    delete process.env.CLAUDE_CODE_DEBUG
  })

  test('does not log debug message when debug mode is disabled', () => {
    delete process.env.CLAUDE_CODE_DEBUG
    const entry = logDebug('Debug info')
    expect(entry === null).toBe(true)
  })
})

describe('log query functions', () => {
  test('getLogs returns all logs', () => {
    logInfo('Info 1')
    logError('Error 1')
    logWarning('Warn 1')

    const logs = getLogs()
    expect(logs.length).toBe(3)
  })

  test('getLogs with limit returns recent logs', () => {
    for (let i = 0; i < 5; i++) {
      logInfo(`Info ${i}`)
    }

    const logs = getLogs(3)
    expect(logs.length).toBe(3)
    expect(logs[0].message).toBe('Info 2')
    expect(logs[2].message).toBe('Info 4')
  })

  test('getLogs filters by level', () => {
    logInfo('Info 1')
    logError('Error 1')
    logError('Error 2')
    logWarning('Warn 1')

    const errorLogs = getLogs(undefined, 'error')
    expect(errorLogs.length).toBe(2)
    expect(errorLogs.every(l => l.level === 'error')).toBe(true)
  })

  test('getErrorLogs returns only error logs', () => {
    logInfo('Info 1')
    logError('Error 1')
    logError('Error 2')

    const logs = getErrorLogs()
    expect(logs.length).toBe(2)
    expect(logs.every(l => l.level === 'error')).toBe(true)
  })

  test('getWarningLogs returns only warning logs', () => {
    logWarning('Warn 1')
    logWarning('Warn 2')
    logInfo('Info 1')

    const logs = getWarningLogs()
    expect(logs.length).toBe(2)
    expect(logs.every(l => l.level === 'warn')).toBe(true)
  })

  test('getInfoLogs returns only info logs', () => {
    logInfo('Info 1')
    logInfo('Info 2')
    logError('Error 1')

    const logs = getInfoLogs()
    expect(logs.length).toBe(2)
    expect(logs.every(l => l.level === 'info')).toBe(true)
  })
})

describe('getLogsByDateRange', () => {
  test('returns logs within date range', () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    logInfo('Test message')

    const logs = getLogsByDateRange(yesterday, tomorrow)
    expect(logs.length).toBe(1)
  })
})

describe('searchLogs', () => {
  test('searches logs by message content', () => {
    logInfo('User logged in')
    logInfo('File saved')
    logError('Database connection failed')

    const results = searchLogs('database')
    expect(results.length).toBe(1)
    expect(results[0].message).toContain('Database')
  })

  test('searches logs with case insensitivity', () => {
    logError('Database ERROR')
    const results = searchLogs('database error')
    expect(results.length).toBe(1)
  })

  test('searches logs with level filter', () => {
    logInfo('Database info')
    logError('Database error')

    const results = searchLogs('database', 'error')
    expect(results.length).toBe(1)
    expect(results[0].level).toBe('error')
  })
})

describe('formatLogs', () => {
  test('formats logs as text', () => {
    logInfo('Test message')
    const logs = getLogs()
    const formatted = formatLogs(logs)
    expect(formatted).toContain('[INFO] Test message')
  })

  test('includes stack trace when requested', () => {
    const error = new Error('Test error')
    logError('Failed', error)
    const logs = getLogs()
    const formatted = formatLogs(logs, true)
    expect(formatted).toContain('Test error')
  })
})

describe('clearLogs', () => {
  test('clears all logs', () => {
    logInfo('Info 1')
    logError('Error 1')
    clearLogs()
    expect(getLogs().length).toBe(0)
  })
})

describe('getLogStats', () => {
  test('returns log count by level', () => {
    logInfo('Info 1')
    logInfo('Info 2')
    logError('Error 1')
    logWarning('Warn 1')

    const stats = getLogStats()
    expect(stats.error).toBe(1)
    expect(stats.warn).toBe(1)
    expect(stats.info).toBe(2)
    expect(stats.debug).toBe(0)
  })
})

describe('log size limit', () => {
  test('maintains maximum log size', () => {
    for (let i = 0; i < 150; i++) {
      logInfo(`Log ${i}`)
    }
    const logs = getLogs()
    expect(logs.length).toBeLessThanOrEqual(100)
    // Should keep the most recent logs
    expect(logs[logs.length - 1].message).toBe('Log 149')
  })
})
