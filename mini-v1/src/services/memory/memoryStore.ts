// ============================================================
// Upgraded Local Memory Store for mini-v7
// ============================================================
// Enhanced: tags, categories, search, import/export
// Supports setMemoryDir() for test isolation.

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

export interface MemoryPromptOptions {
  query?: string
  limit?: number
  maxChars?: number
}

// ============================================================
// Paths (mutable for test isolation)
// ============================================================

let memoryDir = join(homedir(), '.claude-code-mini')
let memoryFile = join(memoryDir, 'memories-v2.json')

/** Override the memory store directory for testing. */
export function setMemoryDir(dir: string): void {
  memoryDir = dir
  memoryFile = join(dir, 'memories-v2.json')
  ensureDir()
}

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
      lines.push('## ' + m.category)
      lines.push('_Tags: ' + m.tags.join(', ') + '_')
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
  return formatMemoriesForPromptWithOptions()
}

export function formatMemoriesForPromptWithOptions(
  options: MemoryPromptOptions = {},
): string {
  try {
    const limit = Math.max(1, options.limit ?? 6)
    const maxChars = Math.max(0, options.maxChars ?? 900)
    const memories = selectMemoriesForPrompt({
      query: options.query,
      limit,
    })
    if (memories.length === 0) return ''

    const lines = ['', '## User Memories', '']
    for (const m of memories) {
      const tagStr = m.tags.length > 0 ? ' [' + m.tags.join(', ') + ']' : ''
      lines.push('- ' + m.content + tagStr)
    }
    lines.push('')
    return truncatePromptBlock(lines.join('\n'), maxChars)
  } catch {
    return ''
  }
}

function selectMemoriesForPrompt(options: {
  query?: string
  limit: number
}): Memory[] {
  const normalizedQuery = options.query?.trim().toLowerCase() ?? ''
  const allMemories = getMemories()

  if (!normalizedQuery) {
    return allMemories.slice(-options.limit)
  }

  const queryTerms = normalizedQuery
    .split(/[^a-z0-9_./-]+/i)
    .map(term => term.trim())
    .filter(Boolean)

  const scored = allMemories
    .map((memory, index) => ({
      memory,
      index,
      score: scoreMemoryForPrompt(memory, queryTerms),
    }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return right.index - left.index
    })
    .slice(0, options.limit)
    .map(entry => entry.memory)

  if (scored.length > 0) {
    return scored
  }

  return allMemories.slice(-Math.min(3, options.limit))
}

function scoreMemoryForPrompt(memory: Memory, queryTerms: string[]): number {
  const haystack = [
    memory.content.toLowerCase(),
    memory.category.toLowerCase(),
    memory.tags.join(' ').toLowerCase(),
  ].join(' ')

  let score = 0
  for (const term of queryTerms) {
    if (!term) continue
    if (memory.content.toLowerCase().includes(term)) {
      score += 4
    }
    if (memory.tags.some(tag => tag.includes(term))) {
      score += 2
    }
    if (memory.category.toLowerCase().includes(term)) {
      score += 1
    }
    if (haystack.includes(term)) {
      score += 1
    }
  }

  return score
}

function truncatePromptBlock(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) {
    return text
  }

  const suffix = '\n\n[User memories truncated to reduce token usage.]'
  const budget = maxChars - suffix.length
  if (budget <= 0) {
    return '[User memories truncated to reduce token usage.]'
  }

  return text.slice(0, budget).trimEnd() + suffix
}
