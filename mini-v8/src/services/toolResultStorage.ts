import {
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const PERSISTED_OUTPUT_THRESHOLD = 100_000
const PERSISTED_OUTPUT_PREFIX = '<persisted-output>'
const PERSISTED_OUTPUT_SUFFIX = '</persisted-output>'

const activePersistedFiles = new Set<string>()

function ensureTempDir(): string {
  const dir = join(tmpdir(), 'mini-v8-tool-results')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function generatePersistedFilePath(): string {
  return join(ensureTempDir(), `${randomUUID().slice(0, 12)}.out`)
}

export function persistLargeToolResult(value: string): string {
  if (value.length <= PERSISTED_OUTPUT_THRESHOLD) {
    return value
  }

  const filePath = generatePersistedFilePath()
  writeFileSync(filePath, value, 'utf-8')
  activePersistedFiles.add(filePath)

  return `${PERSISTED_OUTPUT_PREFIX}${filePath}${PERSISTED_OUTPUT_SUFFIX}`
}

export function restorePersistedToolResult(value: string): string {
  if (!value.startsWith(PERSISTED_OUTPUT_PREFIX)) {
    return value
  }

  const filePath = value.slice(
    PERSISTED_OUTPUT_PREFIX.length,
    -PERSISTED_OUTPUT_SUFFIX.length,
  )

  if (!existsSync(filePath)) {
    return '[Persisted output unavailable - file not found]'
  }

  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return '[Persisted output unavailable - read error]'
  }
}

export function cleanupAllPersistedResults(): void {
  for (const filePath of activePersistedFiles) {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }
    } catch {
      /* ignore */
    }
  }
  activePersistedFiles.clear()
}

export function releasePersistedResult(value: string): void {
  if (!value.startsWith(PERSISTED_OUTPUT_PREFIX)) return

  const filePath = value.slice(
    PERSISTED_OUTPUT_PREFIX.length,
    -PERSISTED_OUTPUT_SUFFIX.length,
  )

  activePersistedFiles.delete(filePath)
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  } catch {
    /* ignore */
  }
}
