import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import {
  getToolIndex,
  searchTools,
  parseToolName,
} from '../../../services/searchExtraTools/toolIndex.js'
import { isDeferredTool } from './prompt.js'
import { SEARCH_EXTRA_TOOLS_TOOL_NAME } from './constants.js'

// Module-level tool list getter — set by tools.ts after all imports resolve.
// This avoids circular imports between tools.ts and SearchExtraToolsTool.
let toolListProvider: (() => Tool[]) | null = null

export function setToolListProvider(fn: () => Tool[]): void {
  toolListProvider = fn
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function keywordScoreTool(
  query: string,
  tool: Tool,
  compiledPatterns: RegExp[],
): number {
  let score = 0

  const { parts, full } = parseToolName(tool.name)
  const lowerName = full.toLowerCase()
  const lowerQuery = query.toLowerCase()

  for (const part of parts) {
    if (lowerQuery.includes(part)) {
      score += part.length >= 4 ? 12 : 10
    }
  }

  for (const pattern of compiledPatterns) {
    if (pattern.test(lowerName)) {
      score += parts.some(p => p.length >= 3) ? 6 : 5
      break
    }
  }

  if (score === 0 && lowerName.includes(lowerQuery)) {
    score += 3
  }

  for (const pattern of compiledPatterns) {
    if (pattern.test(tool.description)) {
      score += 2
      break
    }
  }

  for (const pattern of compiledPatterns) {
    if (pattern.test(tool.prompt)) {
      score += 1
      break
    }
  }

  return score
}

function compileTermPatterns(terms: string[]): RegExp[] {
  return terms
    .filter(t => t.length >= 2)
    .map(t => new RegExp('\\b' + escapeRegExp(t.toLowerCase()), 'i'))
}

interface KeywordMatch {
  name: string
  score: number
}

function searchToolsWithKeywords(
  query: string,
  deferredTools: Tool[],
  maxResults: number,
): KeywordMatch[] {
  const lowerQuery = query.toLowerCase().trim()

  const exactMatch = deferredTools.find(
    t => t.name.toLowerCase() === lowerQuery,
  )
  if (exactMatch) {
    return [{ name: exactMatch.name, score: 100 }]
  }

  if (lowerQuery.startsWith('mcp__')) {
    const prefixMatches = deferredTools
      .filter(t => t.name.toLowerCase().startsWith(lowerQuery))
      .map(t => ({ name: t.name, score: 80 }))
    if (prefixMatches.length > 0) {
      return prefixMatches.slice(0, maxResults)
    }
  }

  const termString = lowerQuery
    .split(/\s+/)
    .map(t => (t.startsWith('+') ? t.slice(1) : t))
    .join(' ')

  const terms = termString.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return []

  const compiledPatterns = compileTermPatterns(terms)

  return deferredTools
    .map(tool => ({
      name: tool.name,
      score: keywordScoreTool(termString, tool, compiledPatterns),
    }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}

export const SearchExtraToolsTool: Tool = {
  name: SEARCH_EXTRA_TOOLS_TOOL_NAME,
  description:
    'Discover available deferred (non-core) tools by keyword search or direct selection. Use when no core tool fits your need.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query. Use "select:ToolA,ToolB" to pick specific tools, "discover:keywords" for semantic TF-IDF search, or plain keywords for hybrid keyword+TF-IDF search.',
      },
      limit: {
        type: 'number',
        description: 'Maximum results. Default 5.',
      },
    },
    required: ['query'],
  },
  prompt:
    'SearchExtraTools discovers deferred tools. Use keyword search, "select:Name" for direct pick, or "discover:query" for semantic search. After discovery, use ExecuteExtraTool to invoke deferred tools.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const query = String(input.query ?? '').trim()
    const limit = Math.min(Number(input.limit ?? 5) || 5, 20)

    if (!query) {
      return {
        content: 'Query is required.',
        success: false,
        error: 'Missing query',
      }
    }

    const allTools = toolListProvider?.() ?? []
    const deferredTools = allTools.filter(t => isDeferredTool(t))

    // ---- select: mode ----
    if (query.startsWith('select:')) {
      const names = query
        .slice('select:'.length)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      if (names.length === 0) {
        return {
          content: 'No tool names provided. Use "select:ToolA,ToolB".',
          success: false,
        }
      }

      const lines: string[] = []
      let foundCount = 0
      let alreadyLoadedCount = 0

      for (const name of names) {
        const deferred = deferredTools.find(
          t => t.name.toLowerCase() === name.toLowerCase(),
        )
        if (deferred) {
          lines.push(`${deferred.name}: ${deferred.description}`)
          foundCount++
        } else {
          const loaded = allTools.find(
            t => t.name.toLowerCase() === name.toLowerCase(),
          )
          if (loaded) {
            lines.push(
              `${loaded.name} (already loaded as core tool — call directly)`,
            )
            alreadyLoadedCount++
          } else {
            lines.push(`${name}: NOT FOUND`)
          }
        }
      }

      const summary = [
        foundCount > 0
          ? `Found ${foundCount} deferred tool(s). Use ExecuteExtraTool with ${JSON.stringify({ tool_name: '<name>', params: {} })} to invoke them.`
          : '',
        alreadyLoadedCount > 0
          ? `${alreadyLoadedCount} tool(s) already loaded as core — call directly.`
          : '',
      ]
        .filter(Boolean)
        .join(' ')

      return { content: `${lines.join('\n')}\n\n${summary}`, success: true }
    }

    // ---- discover: mode (TF-IDF only) ----
    if (query.startsWith('discover:')) {
      const discoverQuery = query.slice('discover:'.length).trim()
      if (!discoverQuery) {
        return {
          content: 'No discover query provided. Use "discover:<keywords>".',
          success: false,
        }
      }

      const index = getToolIndex(allTools, isDeferredTool)
      const results = searchTools(discoverQuery, index, limit)

      if (results.length === 0) {
        return {
          content: `No deferred tools found matching "${discoverQuery}". Try different keywords, or use "select:ToolName" if you know the exact name.`,
          success: true,
        }
      }

      const lines = results.map(
        r => `${r.name} (score: ${r.score.toFixed(2)}): ${r.description}`,
      )

      return {
        content: `${lines.join('\n\n')}\n\nFound ${results.length} deferred tool(s) for "${discoverQuery}". Use ExecuteExtraTool with ${JSON.stringify({ tool_name: '<name>', params: {} })} to invoke a deferred tool.`,
        success: true,
      }
    }

    // ---- Hybrid keyword + TF-IDF search ----
    const keywordMatches = searchToolsWithKeywords(
      query,
      deferredTools,
      limit * 2,
    )
    const index = getToolIndex(allTools, isDeferredTool)
    const tfidfResults = searchTools(query, index, limit * 2)

    const kwScoreMap = new Map<string, number>()
    for (const kw of keywordMatches) kwScoreMap.set(kw.name, kw.score)

    const tfidfScoreMap = new Map<string, number>()
    for (const r of tfidfResults) tfidfScoreMap.set(r.name, r.score)

    const allNames = new Set([...kwScoreMap.keys(), ...tfidfScoreMap.keys()])
    const maxKw = Math.max(1, ...kwScoreMap.values())
    const maxTfidf = Math.max(1, ...tfidfScoreMap.values())

    const merged: { name: string; score: number; tool: Tool }[] = []
    for (const name of allNames) {
      const kwNorm = (kwScoreMap.get(name) ?? 0) / maxKw
      const tfidfNorm = (tfidfScoreMap.get(name) ?? 0) / maxTfidf
      const score = kwNorm * 0.4 + tfidfNorm * 0.6
      const tool = deferredTools.find(t => t.name === name)
      if (tool) merged.push({ name, score, tool })
    }

    merged.sort((a, b) => b.score - a.score)
    const top = merged.slice(0, limit)

    if (top.length === 0) {
      return {
        content: `No deferred tools found matching "${query}". Try different keywords, use "select:ToolName" if you know the exact name, or "discover:<keywords>" for semantic search.`,
        success: true,
      }
    }

    const lines = top.map(
      m =>
        `${m.tool.name} (score: ${m.score.toFixed(2)}): ${m.tool.description}`,
    )

    return {
      content: `${lines.join('\n')}\n\nFound ${top.length} deferred tool(s). Use ExecuteExtraTool with ${JSON.stringify({ tool_name: '<name>', params: {} })} to invoke a deferred tool. Core tools are called directly.`,
      success: true,
      metadata: { count: top.length, names: top.map(m => m.name) },
    }
  },

  userFacingName: () => 'SearchExtraTools',
}
