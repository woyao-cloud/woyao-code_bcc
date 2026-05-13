/**
 * Simple Memory system for mini-v3.
 * Saves and loads memories from a local file.
 * Gracefully handles permission errors.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface Memory {
  id: string
  content: string
  createdAt: string
}

const MEMORY_DIR = join(homedir(), '.claude-code-mini')
const MEMORY_FILE = join(MEMORY_DIR, 'memories.json')

function ensureDir(): boolean {
  if (existsSync(MEMORY_DIR)) return true
  try {
    mkdirSync(MEMORY_DIR, { recursive: true })
    return true
  } catch {
    return false
  }
}

function loadMemories(): Memory[] {
  if (!ensureDir()) return []
  if (!existsSync(MEMORY_FILE)) return []
  try {
    const raw = readFileSync(MEMORY_FILE, 'utf-8')
    return JSON.parse(raw) as Memory[]
  } catch {
    return []
  }
}

function saveMemories(memories: Memory[]): void {
  if (!ensureDir()) return
  try {
    writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2), 'utf-8')
  } catch {
    // Silently fail if we can write
  }
}

export function addMemory(content: string): Memory | undefined {
  try {
    const memories = loadMemories()
    const memory: Memory = {
      id: 'mem_' + Date.now(),
      content,
      createdAt: new Date().toISOString(),
    }
    memories.push(memory)
    saveMemories(memories)
    return memory
  } catch {
    return undefined
  }
}

export function getMemories(): Memory[] {
  try {
    return loadMemories()
  } catch {
    return []
  }
}

export function formatMemoriesForPrompt(): string {
  try {
    const memories = getMemories()
    if (memories.length === 0) return ''

    const lines = ['', '## User Memories', '']
    for (const m of memories.slice(-10)) {
      lines.push('- ' + m.content)
    }
    lines.push('')
    return lines.join('\n')
  } catch {
    return ''
  }
}
