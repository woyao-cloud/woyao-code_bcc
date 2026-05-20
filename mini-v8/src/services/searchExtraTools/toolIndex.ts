import type { Tool } from '../../Tool.js'
import {
  tokenizeAndStem,
  computeWeightedTf,
  computeIdf,
  cosineSimilarity,
} from './localSearch.js'

export interface ToolIndexEntry {
  name: string
  normalizedName: string
  description: string
  isMcp: boolean
  isDeferred: boolean
  inputSchema: Record<string, unknown> | undefined
  tokens: string[]
  tfVector: Map<string, number>
}

export interface SearchExtraToolsResult {
  name: string
  description: string
  score: number
  isMcp: boolean
  isDeferred: boolean
  inputSchema: Record<string, unknown> | undefined
}

const TOOL_FIELD_WEIGHT = {
  name: 3.0,
  prompt: 2.0,
  description: 1.0,
} as const

const SEARCH_EXTRA_TOOLS_DISPLAY_MIN_SCORE = 0.1

const CJK_MIN_BIGRAM_MATCHES = 2
const CJK_RANGE = /[一-鿿㐀-䶿]/

function isCjk(ch: string): boolean {
  return CJK_RANGE.test(ch)
}

export function parseToolName(name: string): {
  parts: string[]
  full: string
  isMcp: boolean
} {
  if (name.startsWith('mcp__')) {
    const withoutPrefix = name.replace(/^mcp__/, '').toLowerCase()
    const parts = withoutPrefix.split('__').flatMap(p => p.split('_'))
    return {
      parts: parts.filter(Boolean),
      full: withoutPrefix.replace(/__/g, ' ').replace(/_/g, ' '),
      isMcp: true,
    }
  }

  const parts = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  return { parts, full: parts.join(' '), isMcp: false }
}

export function buildToolIndex(
  tools: Tool[],
  isDeferred: (t: Tool) => boolean,
): ToolIndexEntry[] {
  const deferredTools = tools.filter(t => isDeferred(t))

  const entries: ToolIndexEntry[] = []
  for (const tool of deferredTools) {
    const { parts: nameParts, full: normalizedName } = parseToolName(tool.name)
    const nameTokens = tokenizeAndStem(nameParts.join(' '))
    const promptTokens = tokenizeAndStem(tool.prompt ?? '')
    const descTokens = tokenizeAndStem(tool.description ?? '')

    const allTokens = [
      ...new Set([...nameTokens, ...promptTokens, ...descTokens]),
    ]

    const tfVector = computeWeightedTf([
      { tokens: nameTokens, weight: TOOL_FIELD_WEIGHT.name },
      { tokens: promptTokens, weight: TOOL_FIELD_WEIGHT.prompt },
      { tokens: descTokens, weight: TOOL_FIELD_WEIGHT.description },
    ])

    entries.push({
      name: tool.name,
      normalizedName,
      description: tool.description ?? '',
      isMcp: tool.isMcp === true,
      isDeferred: true,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      tokens: allTokens,
      tfVector,
    })
  }

  const idf = computeIdf(entries)

  for (const entry of entries) {
    for (const [term, tf] of entry.tfVector) {
      entry.tfVector.set(term, tf * (idf.get(term) ?? 0))
    }
  }

  return entries
}

export function searchTools(
  query: string,
  index: ToolIndexEntry[],
  limit = 5,
): SearchExtraToolsResult[] {
  if (index.length === 0 || !query.trim()) return []

  const queryTokens = tokenizeAndStem(query)
  if (queryTokens.length === 0) return []

  const queryTf = new Map<string, number>()
  const freq = new Map<string, number>()
  for (const t of queryTokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  let max = 1
  for (const v of freq.values()) if (v > max) max = v
  for (const [term, count] of freq) queryTf.set(term, count / max)

  const idf = computeIdf(index)
  const queryTfIdf = new Map<string, number>()
  for (const [term, tf] of queryTf) {
    queryTfIdf.set(term, tf * (idf.get(term) ?? 0))
  }

  const queryCjkTokens = queryTokens.filter(t => isCjk(t[0] ?? ''))
  const queryAsciiTokens = queryTokens.filter(t => !isCjk(t[0] ?? ''))
  const queryLower = query.toLowerCase().replace(/[-_]/g, ' ')

  const results: SearchExtraToolsResult[] = []
  for (const entry of index) {
    let score = cosineSimilarity(queryTfIdf, entry.tfVector)

    if (queryCjkTokens.length > 0 && score > 0) {
      const matchingCjk = queryCjkTokens.filter(t => entry.tfVector.has(t))
      if (matchingCjk.length < CJK_MIN_BIGRAM_MATCHES) {
        const hasAsciiMatch = queryAsciiTokens.some(t => entry.tfVector.has(t))
        if (!hasAsciiMatch) score = 0
      }
    }

    if (queryLower.includes(entry.normalizedName)) {
      score = Math.max(score, 0.75)
    }

    if (score >= SEARCH_EXTRA_TOOLS_DISPLAY_MIN_SCORE) {
      results.push({
        name: entry.name,
        description: entry.description,
        score,
        isMcp: entry.isMcp,
        isDeferred: entry.isDeferred,
        inputSchema: entry.inputSchema,
      })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

let cachedIndex: ToolIndexEntry[] | null = null
let cachedToolNames: string | null = null

export function getToolIndex(
  tools: Tool[],
  isDeferred: (t: Tool) => boolean,
): ToolIndexEntry[] {
  const currentKey = tools
    .map(t => t.name)
    .sort()
    .join(',')

  if (cachedIndex && cachedToolNames === currentKey) {
    return cachedIndex
  }

  cachedIndex = buildToolIndex(tools, isDeferred)
  cachedToolNames = currentKey
  return cachedIndex
}

export function clearToolIndexCache(): void {
  cachedIndex = null
  cachedToolNames = null
}
