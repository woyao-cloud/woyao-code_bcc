import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'

/**
 * WebSearch tool - uses DuckDuckGo HTML search (no API key required).
 * Falls back gracefully if network is unavailable.
 */
export const WebSearchTool: Tool = {
  name: 'WebSearch',
  description:
    'Searches the web and returns formatted results. ' +
    'Use for finding current information, documentation, or answers.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      allowedDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of allowed domains to filter results',
      },
      blockedDomains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of blocked domains to exclude',
      },
    },
    required: ['query'],
  },
  prompt: 'WebSearch tool for searching the web.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const query = String(input.query ?? '')
    if (!query.trim()) {
      return {
        content: 'No search query provided',
        success: false,
        error: 'Missing query',
      }
    }

    const allowedDomains = (input.allowedDomains as string[]) ?? []
    const blockedDomains = (input.blockedDomains as string[]) ?? []

    try {
      const results = await searchDuckDuckGo(query)

      if (results.length === 0) {
        return { content: `No results found for: "${query}"`, success: true }
      }

      // Apply domain filters
      let filtered = results
      if (allowedDomains.length > 0) {
        filtered = filtered.filter(r =>
          allowedDomains.some(d => r.url.includes(d)),
        )
      }
      if (blockedDomains.length > 0) {
        filtered = filtered.filter(
          r => !blockedDomains.some(d => r.url.includes(d)),
        )
      }

      const formatted = filtered
        .map(
          (r, i) =>
            `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`,
        )
        .join('\n\n')

      return {
        content: `Search results for "${query}":\n\n${formatted}`,
        success: true,
        metadata: {
          totalResults: results.length,
          filteredCount: filtered.length,
        },
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: `Search failed: ${msg}`,
        success: false,
        error: msg,
      }
    }
  },

  userFacingName: () => 'WebSearch',
}

interface SearchResult {
  title: string
  url: string
  snippet: string
}

/**
 * Search DuckDuckGo using their HTML endpoint (no API key needed).
 */
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ClaudeCodeMini/2.0',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned ${response.status}`)
  }

  const html = await response.text()
  return parseDuckDuckGoResults(html)
}

/**
 * Parse DuckDuckGo HTML results page.
 */
function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = []

  // Match result blocks: each has a link with class "result__a" and snippet in "result__snippet"
  const resultRegex =
    /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

  let match
  while ((match = resultRegex.exec(html)) !== null) {
    const url = decodeURIComponent(
      match[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').split('&')[0],
    )
    results.push({
      title: stripHtml(match[2]).trim(),
      url: url,
      snippet: stripHtml(match[3]).trim(),
    })

    if (results.length >= 10) break
  }

  return results
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}
