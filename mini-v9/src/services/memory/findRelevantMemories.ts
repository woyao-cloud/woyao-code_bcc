import { scanMemoryDirs, type MemdirEntry } from './memdir.js'

export interface RelevantMemory {
  agentType: string
  scope: string
  filename: string
  content: string
  relevance: number
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'and',
  'or',
  'but',
  'not',
  'no',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'do',
  'does',
  'did',
  'will',
  'would',
  'can',
  'could',
  'has',
  'have',
  'had',
  'get',
  'got',
  'make',
  'made',
  'there',
  'here',
  'all',
  'any',
  'each',
  'every',
  'some',
  'more',
  'most',
  'other',
  'such',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'about',
  'above',
  'after',
  'again',
  'against',
  'below',
  'between',
  'into',
  'through',
  'during',
  'before',
  'after',
  'up',
  'down',
  'out',
  'off',
  'over',
  'under',
  'then',
  'once',
  'here',
  'there',
  'when',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
}

function computeRelevance(query: string, content: string): number {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return 0

  const contentTokens = tokenize(content)
  if (contentTokens.length === 0) return 0

  const contentSet = new Set(contentTokens)

  // Count matching tokens
  let matches = 0
  for (const token of queryTokens) {
    // Exact match
    if (contentSet.has(token)) {
      matches += 2
      continue
    }
    // Substring match
    for (const ct of contentTokens) {
      if (ct.includes(token) || token.includes(ct)) {
        matches += 1
        break
      }
    }
  }

  return matches / queryTokens.length
}

export function findRelevantMemories(
  query: string,
  options?: {
    maxResults?: number
    minRelevance?: number
    cwd?: string
    scope?: 'user' | 'project' | 'local'
  },
): RelevantMemory[] {
  const maxResults = options?.maxResults ?? 5
  const minRelevance = options?.minRelevance ?? 0.1

  let entries: MemdirEntry[] = scanMemoryDirs(options?.cwd)

  if (options?.scope) {
    entries = entries.filter(e => e.scope === options.scope)
  }

  const scored: RelevantMemory[] = entries.map(e => ({
    agentType: e.agentType,
    scope: e.scope,
    filename: e.filename,
    content: e.content.slice(0, 2000),
    relevance: computeRelevance(query, e.content),
  }))

  return scored
    .filter(m => m.relevance >= minRelevance)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxResults)
}
