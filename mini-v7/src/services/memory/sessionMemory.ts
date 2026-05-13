// ============================================================
// Session Memory Engine for mini-v7
// ============================================================
// Auto-extracts key notes from the ongoing conversation
// into a per-session markdown file for context preservation.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ============================================================
// Types
// ============================================================

export interface SessionMemoryNote {
  id: string
  category: string
  content: string
  timestamp: string
}

export interface SessionMemoryConfig {
  enabled: boolean
  /** Min tokens before first extraction */
  minTokensForInit: number
  /** Min tokens between extractions */
  minTokensBetweenUpdate: number
  /** Max notes to retain */
  maxNotes: number
}

// ============================================================
// Config
// ============================================================

const DEFAULT_CONFIG: SessionMemoryConfig = {
  enabled: false,
  minTokensForInit: 2000,
  minTokensBetweenUpdate: 1000,
  maxNotes: 30,
}

let config: SessionMemoryConfig = { ...DEFAULT_CONFIG }

// Per-session state
let sessionId: string | null = null
let lastExtractionTokenCount = 0
let extractedNotes: SessionMemoryNote[] = []

// ============================================================
// Paths
// ============================================================

function getSessionMemoryDir(): string {
  const dir = join(homedir(), '.claude-code-mini', 'session-memory')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

function getSessionMemoryPath(id: string): string {
  return join(getSessionMemoryDir(), `${id}.md`)
}

// ============================================================
// Session lifecycle
// ============================================================

export function initSession(): void {
  sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  lastExtractionTokenCount = 0
  extractedNotes = []
}

export function getSessionId(): string | null {
  return sessionId
}

export function endSession(): void {
  sessionId = null
  extractedNotes = []
}

// ============================================================
// Config management
// ============================================================

export function getSessionMemoryConfig(): SessionMemoryConfig {
  return { ...config }
}

export function setSessionMemoryConfig(
  updates: Partial<SessionMemoryConfig>,
): void {
  config = { ...config, ...updates }
}

// ============================================================
// Token estimation (simple heuristic)
// ============================================================

export function estimateTotalTokens(messages: BetaMessageParam[]): number {
  let total = 0
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += Math.ceil(msg.content.length / 4)
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          total += Math.ceil(String(block.text).length / 4)
        }
      }
    }
  }
  return total
}

// ============================================================
// Extraction logic
// ============================================================

/**
 * Check if we should trigger a session memory extraction.
 */
export function shouldExtractMemory(messages: BetaMessageParam[]): boolean {
  if (!config.enabled) return false

  const currentTokens = estimateTotalTokens(messages)

  // First extraction after hitting init threshold
  if (extractedNotes.length === 0) {
    return currentTokens >= config.minTokensForInit
  }

  // Subsequent extractions after enough new tokens
  return (
    currentTokens - lastExtractionTokenCount >= config.minTokensBetweenUpdate
  )
}

/**
 * Extract key notes from the conversation.
 * Uses a heuristic approach to identify important info:
 * - Repeated technical terms
 * - Decisions made ("I'll...", "Let's...", "We should...")
 * - File paths and code patterns
 */
export function extractSessionNotes(
  messages: BetaMessageParam[],
): SessionMemoryNote[] {
  const userMessages = extractUserMessages(messages)
  const assistantDecisions = extractAssistantDecisions(messages)
  const filePaths = extractFilePaths(messages)

  const notes: SessionMemoryNote[] = []
  const now = new Date().toISOString()

  // User intent/requests
  for (const [i, msg] of userMessages.slice(-5).entries()) {
    const preview = msg.slice(0, 150).trim()
    if (preview && !isDuplicateNote(notes, preview)) {
      notes.push({
        id: `user-${i}`,
        category: 'user-request',
        content: preview,
        timestamp: now,
      })
    }
  }

  // Decisions made
  for (const [i, decision] of assistantDecisions.slice(-5).entries()) {
    const preview = decision.slice(0, 150).trim()
    if (preview && !isDuplicateNote(notes, preview)) {
      notes.push({
        id: `decision-${i}`,
        category: 'decision',
        content: preview,
        timestamp: now,
      })
    }
  }

  // Key file paths
  for (const [i, fp] of filePaths.slice(-10).entries()) {
    if (!isDuplicateNote(notes, fp)) {
      notes.push({
        id: `file-${i}`,
        category: 'context',
        content: `File: ${fp}`,
        timestamp: now,
      })
    }
  }

  return notes
}

/**
 * Persist session memory notes to the markdown file.
 */
export function persistSessionMemory(notes: SessionMemoryNote[]): void {
  if (!sessionId) return

  const path = getSessionMemoryPath(sessionId)

  // Merge with existing notes
  const existing = readSessionMemory(sessionId)
  const allNotes = mergeNotes(existing, notes, config.maxNotes)

  // Build markdown
  const lines = ['# Session Memory', '', `Session: ${sessionId}`, '']

  const byCategory = groupBy(allNotes, n => n.category)
  for (const [category, catNotes] of Object.entries(byCategory)) {
    lines.push(`## ${formatCategory(category)}`)
    for (const note of catNotes) {
      lines.push(`- ${note.content}`)
      lines.push(`  _${note.timestamp}_`)
    }
    lines.push('')
  }

  try {
    writeFileSync(path, lines.join('\n'), 'utf-8')
  } catch {}
}

/**
 * Read existing session memory from disk.
 */
export function readSessionMemory(id: string): SessionMemoryNote[] {
  const path = getSessionMemoryPath(id)
  if (!existsSync(path)) return []

  try {
    const raw = readFileSync(path, 'utf-8')
    return parseSessionMemoryMarkdown(raw)
  } catch {
    return []
  }
}

/**
 * Get the current session memory content for injection into the system prompt.
 */
export function getSessionMemoryForPrompt(id: string): string {
  const notes = readSessionMemory(id)
  if (notes.length === 0) return ''

  const lines = ['', '## Session Memory (auto-extracted)', '']
  const byCategory = groupBy(notes, n => n.category)
  for (const [category, catNotes] of Object.entries(byCategory)) {
    lines.push(`### ${formatCategory(category)}`)
    for (const note of catNotes.slice(-5)) {
      lines.push(`- ${note.content}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// ============================================================
// Helpers
// ============================================================

function extractUserMessages(messages: BetaMessageParam[]): string[] {
  return messages
    .filter(m => m.role === 'user')
    .map(m =>
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .filter(
                (b): b is { type: 'text'; text: string } =>
                  typeof b === 'object' &&
                  b !== null &&
                  'type' in b &&
                  b.type === 'text',
              )
              .map(b => b.text)
              .join(' ')
          : '',
    )
    .filter(Boolean)
}

function extractAssistantDecisions(messages: BetaMessageParam[]): string[] {
  const decisions: string[] = []
  const decisionPatterns = [
    /I will\s+(.+?)[.!]/gi,
    /I'll\s+(.+?)[.!]/gi,
    /Let's\s+(.+?)[.!]/gi,
    /We should\s+(.+?)[.!]/gi,
    /The plan is\s+(.+?)[.!]/gi,
  ]

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    const text =
      typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .filter(
                (b): b is { type: 'text'; text: string } =>
                  typeof b === 'object' &&
                  b !== null &&
                  'type' in b &&
                  b.type === 'text',
              )
              .map(b => b.text)
              .join(' ')
          : ''

    for (const pattern of decisionPatterns) {
      const matches = text.matchAll(pattern)
      for (const match of matches) {
        if (match[1]) decisions.push(match[1].trim())
      }
    }
  }
  return decisions
}

function extractFilePaths(messages: BetaMessageParam[]): string[] {
  const paths: string[] = []
  const filePathPattern =
    /(?:File|file|path|Path|\b(?:src|lib|app|packages|tests)\b)[:\s]*`?([a-zA-Z0-9_/.-]+\.[a-z]{1,6})`?/g

  for (const msg of messages) {
    const text =
      typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .filter(
                (b): b is { type: 'text'; text: string } =>
                  typeof b === 'object' &&
                  b !== null &&
                  'type' in b &&
                  b.type === 'text',
              )
              .map(b => b.text)
              .join(' ')
          : ''

    const matches = text.matchAll(filePathPattern)
    for (const match of matches) {
      if (match[1]) paths.push(match[1])
    }
  }
  return [...new Set(paths)]
}

function mergeNotes(
  existing: SessionMemoryNote[],
  newNotes: SessionMemoryNote[],
  maxNotes: number,
): SessionMemoryNote[] {
  const merged = [...existing]
  for (const note of newNotes) {
    if (!isDuplicateNote(merged, note.content)) {
      merged.push(note)
    }
  }
  // Keep most recent, trim oldest
  return merged.slice(-maxNotes)
}

function isDuplicateNote(notes: SessionMemoryNote[], content: string): boolean {
  return notes.some(n => n.content === content)
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of arr) {
    const key = fn(item)
    if (!result[key]) result[key] = []
    result[key]!.push(item)
  }
  return result
}

function formatCategory(category: string): string {
  const labels: Record<string, string> = {
    'user-request': 'User Requests',
    decision: 'Decisions Made',
    context: 'Context & Files',
  }
  return labels[category] ?? category
}

function parseSessionMemoryMarkdown(raw: string): SessionMemoryNote[] {
  const notes: SessionMemoryNote[] = []
  const lines = raw.split('\n')
  let currentCategory = 'general'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? ''

    if (line.startsWith('## ')) {
      const header = line.slice(3).trim().toLowerCase()
      if (header.includes('request')) currentCategory = 'user-request'
      else if (header.includes('decision')) currentCategory = 'decision'
      else if (header.includes('context') || header.includes('file'))
        currentCategory = 'context'
      else currentCategory = header.replace(/\s+/g, '-')
    } else if (line.startsWith('- ')) {
      const content = line.slice(2).trim()
      notes.push({
        id: `note-${notes.length}`,
        category: currentCategory,
        content,
        timestamp: new Date().toISOString(),
      })
    }
  }

  return notes
}
