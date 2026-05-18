import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface MemdirEntry {
  path: string
  agentType: string
  scope: 'user' | 'project' | 'local'
  filename: string
  content: string
  size: number
  modifiedAt: Date
}

function getAgentMemoryBaseDir(): string {
  return join(homedir(), '.claude', 'agent-memory')
}

function getProjectMemoryBaseDir(cwd: string): string {
  return join(cwd, '.claude', 'agent-memory')
}

function getLocalMemoryBaseDir(cwd: string): string {
  return join(cwd, '.claude', 'agent-memory-local')
}

export function scanMemoryDirs(cwd?: string): MemdirEntry[] {
  const entries: MemdirEntry[] = []
  const baseDir = getAgentMemoryBaseDir()

  if (existsSync(baseDir)) {
    scanAgentDir(baseDir, 'user', entries)
  }
  if (cwd) {
    const projectDir = getProjectMemoryBaseDir(cwd)
    if (existsSync(projectDir)) {
      scanAgentDir(projectDir, 'project', entries)
    }
    const localDir = getLocalMemoryBaseDir(cwd)
    if (existsSync(localDir)) {
      scanAgentDir(localDir, 'local', entries)
    }
  }

  return entries
}

function scanAgentDir(
  baseDir: string,
  scope: MemdirEntry['scope'],
  entries: MemdirEntry[],
): void {
  try {
    const agentTypes = readdirSync(baseDir, { withFileTypes: true })
    for (const agentType of agentTypes) {
      if (!agentType.isDirectory()) continue
      const agentDir = join(baseDir, agentType.name)
      try {
        const files = readdirSync(agentDir)
        for (const file of files) {
          if (!file.endsWith('.md')) continue
          const filePath = join(agentDir, file)
          try {
            const stat = statSync(filePath)
            if (!stat.isFile()) continue
            const content = readFileSync(filePath, 'utf-8')
            entries.push({
              path: filePath,
              agentType: agentType.name,
              scope,
              filename: file,
              content,
              size: stat.size,
              modifiedAt: stat.mtime,
            })
          } catch {
            // skip unreadable files
          }
        }
      } catch {
        // skip unreadable agent dirs
      }
    }
  } catch {
    // skip unreadable base dir
  }
}

export function getMemoryStats(cwd?: string): {
  totalFiles: number
  totalSize: number
  byScope: Record<string, number>
} {
  const entries = scanMemoryDirs(cwd)
  const byScope: Record<string, number> = {}

  for (const e of entries) {
    byScope[e.scope] = (byScope[e.scope] ?? 0) + 1
  }

  return {
    totalFiles: entries.length,
    totalSize: entries.reduce((s, e) => s + e.size, 0),
    byScope,
  }
}
