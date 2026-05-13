// ============================================================
// Upgraded Local Memory Store for mini-v7
// ============================================================
// Enhanced: tags, categories, search, import/export

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface Memory {
  id: string
  content: string
  tags: string[]
  category: string
  createdAt: string
  updatedAt: string
}

export interface MemoryStore {
  version: number
  memories: Memory[]
}

// ============================================================
// Paths
// ============================================================

let memoryDir = join(homedir(), '.claude-code-mini')
let memoryFile = join(memoryDir, 'memories-v2.json')

// ============================================================
// Internal operations
// ============================================================

function ensureDir(): boolean {
  if (existsSync(memoryDir)) return true
  try {
    mkdirSync(memoryDir, { recursive: true })
    return true
  } catch {
    return false
  }
}

function loadStore(): MemoryStore {
  if (!ensureDir()) return { version: 1, memories: [] }
  if (!existsSync(memoryFile)) return { version: 1, memories: [] }
  try {
    return JSON.parse(readFileSync(memoryFile, 'utf-8')) as MemoryStore
  } catch {
    return { version: 1, memories: [] }
  }
}

function saveStore(store: MemoryStore): void {
  if (!ensureDir()) return
  try {
    writeFileSync(memoryFile, JSON.stringify(store, null, 2), 'utf-8')
  } catch {}
}

// ============================================================
// CRUD
// ============================================================

export function addMemory(
  content: string,
  tags: string[] = [],
  category: string = 'general',
): Memory | undefined {
  try {
    const store = loadStore()
    const now = new Date().toISOString()
    const memory: Memory = {
      id: 'mem_' + Date.now(),
      content,
      tags: tags.map(t => t.toLowerCase().trim()).filter(Boolean),
      category,
      createdAt: now,
      updatedAt: now,
    }
    store.memories.push(memory)
    saveStore(store)
    return memory
  } catch {
    return undefined
  }
}

export function getMemories(options?: {
  category?: string
  tags?: string[]
  limit?: number
}): Memory[] {
  try {
    const store = loadStore()
    let memories = store.memories

    if (options?.category) {
      memories = memories.filter(m => m.category === options.category)
    }

    if (options?.tags && options.tags.length > 0) {
      const searchTags = options.tags.map(t => t.toLowerCase())
      memories = memories.filter(m =>
        searchTags.some(st => m.tags.includes(st)),
      )
    }

    if (options?.limit) {
      memories = memories.slice(-options.limit)
    }

    return memories
  } catch {
    return []
  }
}

export function getMemoryById(id: string): Memory | undefined {
  try {
    const store = loadStore()
    return store.memories.find(m => m.id === id)
  } catch {
    return undefined
  }
}

export function updateMemory(
  id: string,
  updates: { content?: string; tags?: string[]; category?: string },
): Memory | undefined {
  try {
    const store = loadStore()
    const index = store.memories.findIndex(m => m.id === id)
    if (index === -1) return undefined

    const memory = store.memories[index]!
    const updated: Memory = {
      ...memory,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    store.memories[index] = updated
    saveStore(store)
    return updated
  } catch {
    return undefined
  }
}

export function deleteMemory(id: string): boolean {
  try {
    const store = loadStore()
    const index = store.memories.findIndex(m => m.id === id)
    if (index === -1) return false
    store.memories.splice(index, 1)
    saveStore(store)
    return true
  } catch {
    return false
  }
}

// ============================================================
// Search
// ============================================================

/** Search memories by content, tags, and category */
export function searchMemories(query: string): Memory[] {
  const store = loadStore()
  const lower = query.toLowerCase()

  return store.memories.filter(
    m =>
      m.content.toLowerCase().includes(lower) ||
      m.tags.some(t => t.includes(lower)) ||
      m.category.toLowerCase().includes(lower),
  )
}

// ============================================================
// Tags
// ============================================================

/** Get all unique tags across all memories */
export function getAllTags(): string[] {
  const store = loadStore()
  const tagSet = new Set<string>()
  for (const m of store.memories) {
    for (const t of m.tags) {
      tagSet.add(t)
    }
  }
  return [...tagSet].sort()
}

/** Get all unique categories */
export function getAllCategories(): string[] {
  const store = loadStore()
  return [...new Set(store.memories.map(m => m.category))].sort()
}

// ============================================================
// Export/Import
// ============================================================

export function exportMemories(format: 'json' | 'markdown' = 'json'): string {
  const store = loadStore()

  if (format === 'markdown') {
    const lines = ['# Memories', '']
    for (const m of store.memories) {
      lines.push(`## ${m.category}`)
      lines.push(`_Tags: ${m.tags.join(', ')}_`)
      lines.push('')
      lines.push(m.content)
      lines.push('')
    }
    return lines.join('\n')
  }

  return JSON.stringify(store, null, 2)
}

export function importMemories(data: string): number {
  try {
    const imported = JSON.parse(data) as MemoryStore
    if (!imported.memories || !Array.isArray(imported.memories)) {
      return 0
    }

    const store = loadStore()
    let count = 0
    for (const mem of imported.memories) {
      if (
        !store.memories.some(
          m => m.content === mem.content && m.createdAt === mem.createdAt,
        )
      ) {
        store.memories.push(mem)
        count++
      }
    }
    saveStore(store)
    return count
  } catch {
    return 0
  }
}

// ============================================================
// Context injection
// ============================================================

export function formatMemoriesForPrompt(): string {
  try {
    const memories = getMemories({ limit: 20 })
    if (memories.length === 0) return ''

    const lines = ['', '## User Memories', '']
    for (const m of memories) {
      const tagStr = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : ''
      lines.push(`- ${m.content}${tagStr}`)
    }
    lines.push('')
    return lines.join('\n')
  } catch {
    return ''
  }
}
