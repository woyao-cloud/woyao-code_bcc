// ============================================================
// Session Memory Engine for mini-v7
// ============================================================
// Auto-extracts key notes from the ongoing conversation
// into a per-session markdown file for context preservation.
// Supports setSessionMemoryDir() for test isolation.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

export interface SessionMemoryNote {
  id: string
  category: string
  content: string
  timestamp: string
}

export interface SessionMemoryConfig {
  enabled: boolean
  minTokensForInit: number
  minTokensBetweenUpdate: number
  maxNotes: number
}

const DEFAULT_CONFIG: SessionMemoryConfig = {
  enabled: false,
  minTokensForInit: 2000,
  minTokensBetweenUpdate: 1000,
  maxNotes: 30,
}

let config: SessionMemoryConfig = { ...DEFAULT_CONFIG }
let sessionId: string | null = null
let lastExtractionTokenCount = 0
let extractedNotes: SessionMemoryNote[] = []

// Mutable path for test isolation
let sessionMemDir = join(homedir(), '.claude-code-mini', 'session-memory')

export function setSessionMemoryDir(dir: string): void {
  sessionMemDir = dir
  try {
    mkdirSync(sessionMemDir, { recursive: true })
  } catch {}
}

function getSessionMemoryDir(): string {
  return sessionMemDir
}

function getSessionMemoryPath(id: string): string {
  return join(getSessionMemoryDir(), id + '.md')
}

export function initSession(): void {
  sessionId =
    'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
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

export function getSessionMemoryConfig(): SessionMemoryConfig {
  return { ...config }
}

export function setSessionMemoryConfig(
  updates: Partial<SessionMemoryConfig>,
): void {
  config = { ...config, ...updates }
}

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

export function shouldExtractMemory(messages: BetaMessageParam[]): boolean {
  if (!config.enabled) return false
  const currentTokens = estimateTotalTokens(messages)
  if (extractedNotes.length === 0) {
    return currentTokens >= config.minTokensForInit
  }
  return (
    currentTokens - lastExtractionTokenCount >= config.minTokensBetweenUpdate
  )
}

export function extractSessionNotes(
  messages: BetaMessageParam[],
): SessionMemoryNote[] {
  const userMessages = extractUserMessages(messages)
  const assistantDecisions = extractAssistantDecisions(messages)
  const filePaths = extractFilePaths(messages)

  const notes: SessionMemoryNote[] = []
  const now = new Date().toISOString()

  for (const [i, msg] of userMessages.slice(-5).entries()) {
    const preview = msg.slice(0, 150).trim()
    if (preview && !isDuplicateNote(notes, preview)) {
      notes.push({
        id: 'user-' + i,
        category: 'user-request',
        content: preview,
        timestamp: now,
      })
    }
  }

  for (const [i, decision] of assistantDecisions.slice(-5).entries()) {
    const preview = decision.slice(0, 150).trim()
    if (preview && !isDuplicateNote(notes, preview)) {
      notes.push({
        id: 'decision-' + i,
        category: 'decision',
        content: preview,
        timestamp: now,
      })
    }
  }

  for (const [i, fp] of filePaths.slice(-10).entries()) {
    if (!isDuplicateNote(notes, fp)) {
      notes.push({
        id: 'file-' + i,
        category: 'context',
        content: 'File: ' + fp,
        timestamp: now,
      })
    }
  }

  return notes
}

export function persistSessionMemory(notes: SessionMemoryNote[]): void {
  if (!sessionId) return
  const path = getSessionMemoryPath(sessionId)
  const existing = readSessionMemory(sessionId)
  const allNotes = mergeNotes(existing, notes, config.maxNotes)

  const lines = ['# Session Memory', '', 'Session: ' + sessionId, '']
  const byCategory = groupBy(allNotes, n => n.category)
  for (const [category, catNotes] of Object.entries(byCategory)) {
    lines.push('## ' + formatCategory(category))
    for (const note of catNotes) {
      lines.push('- ' + note.content)
      lines.push('  _' + note.timestamp + '_')
    }
    lines.push('')
  }

  try {
    writeFileSync(path, lines.join('\n'), 'utf-8')
  } catch {}
}

export function readSessionMemory(id: string): SessionMemoryNote[] {
  const path = getSessionMemoryPath(id)
  if (!existsSync(path)) return []
  try {
    return parseSessionMemoryMarkdown(readFileSync(path, 'utf-8'))
  } catch {
    return []
  }
}

export function getSessionMemoryForPrompt(id: string): string {
  const notes = readSessionMemory(id)
  if (notes.length === 0) return ''

  const lines = ['', '## Session Memory (auto-extracted)', '']
  const byCategory = groupBy(notes, n => n.category)
  for (const [category, catNotes] of Object.entries(byCategory)) {
    lines.push('### ' + formatCategory(category))
    for (const note of catNotes.slice(-5)) {
      lines.push('- ' + note.content)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// Helpers

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
      for (const match of text.matchAll(pattern)) {
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

    for (const match of text.matchAll(filePathPattern)) {
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
    if (!isDuplicateNote(merged, note.content)) merged.push(note)
  }
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
      notes.push({
        id: 'note-' + notes.length,
        category: currentCategory,
        content: line.slice(2).trim(),
        timestamp: new Date().toISOString(),
      })
    }
  }

  return notes
}
