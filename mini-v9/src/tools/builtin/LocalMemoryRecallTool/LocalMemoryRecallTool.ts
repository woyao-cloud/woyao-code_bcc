/**
 * LocalMemoryRecallTool for mini-v9.
 * Searches past session transcripts and agent memories.
 * Supports query by keyword, scope filtering, and listing recent sessions.
 */

import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { findRelevantMemories } from '../../../services/memory/findRelevantMemories.js'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const SESSION_MEMORY_DIR = join(homedir(), '.claude-code-mini', 'session-memory')

export const LocalMemoryRecallTool: Tool = {
  name: 'LocalMemoryRecall',
  description:
    'Search past session transcripts and agent memories. ' +
    'Actions: search — find relevant memories by keyword query; ' +
    'sessions — list recent session memory files; ' +
    'session — view contents of a specific session. ' +
    'Useful for recalling previous decisions, patterns, and context across sessions.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'sessions', 'session'],
        description: 'The recall action to perform',
      },
      query: {
        type: 'string',
        description: 'Search query (required for search action)',
      },
      scope: {
        type: 'string',
        enum: ['user', 'project', 'local'],
        description: 'Memory scope filter (for search action)',
      },
      max_results: {
        type: 'number',
        description: 'Maximum results to return (default: 5, max: 20)',
      },
      session_id: {
        type: 'string',
        description: 'Session ID to view (required for session action)',
      },
    },
    required: ['action'],
  },
  prompt:
    'LocalMemoryRecall tool: search past session context and agent memories. ' +
    'Use "search <query>" to find relevant memories across sessions. ' +
    'Use "sessions" to list recent session memory files. ' +
    'Use "session <id>" to examine a specific session\'s memory.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const action = String(input.action ?? '').trim()

    switch (action) {
      case 'search': {
        const query = String(input.query ?? '').trim()
        if (!query) {
          return {
            content: 'Search query is required',
            success: false,
            error: 'Missing query',
          }
        }

        const maxResults = Math.min(20, Math.max(1, typeof input.max_results === 'number' ? input.max_results : 5))
        const scope = input.scope ? String(input.scope).trim() as 'user' | 'project' | 'local' : undefined

        const results = findRelevantMemories(query, {
          maxResults,
          minRelevance: 0.1,
          cwd: ctx.cwd,
          scope,
        })

        if (results.length === 0) {
          return {
            content: 'No relevant memories found for: ' + query,
            success: true,
          }
        }

        const parts: string[] = [
          `Found ${results.length} relevant memories for: "${query}"`,
          '',
        ]
        for (const r of results) {
          parts.push(`### ${r.agentType} (${r.scope}) — relevance: ${r.relevance.toFixed(2)}`)
          parts.push(r.content.slice(0, 300))
          parts.push('')
        }

        return {
          content: parts.join('\n'),
          success: true,
        }
      }

      case 'sessions': {
        if (!existsSync(SESSION_MEMORY_DIR)) {
          return {
            content: 'No session memory files found.',
            success: true,
          }
        }

        const files = readdirSync(SESSION_MEMORY_DIR)
          .filter(f => f.endsWith('.md'))
          .sort()
          .reverse()
          .slice(0, 20)

        if (files.length === 0) {
          return {
            content: 'No session memory files found.',
            success: true,
          }
        }

        const parts: string[] = [
          `Recent sessions (${files.length} shown)`,
          '',
        ]
        for (const file of files) {
          const sessionId = file.replace(/\.md$/, '')
          const stats = existsSync(join(SESSION_MEMORY_DIR, file))
            ? file
            : ''
          parts.push(`  ${sessionId}`)
        }

        return {
          content: parts.join('\n'),
          success: true,
        }
      }

      case 'session': {
        const sessionId = String(input.session_id ?? '').trim()
        if (!sessionId) {
          return {
            content: 'Session ID is required',
            success: false,
            error: 'Missing session_id',
          }
        }

        const filePath = join(SESSION_MEMORY_DIR, sessionId + '.md')
        if (!existsSync(filePath)) {
          return {
            content: `Session memory not found: ${sessionId}`,
            success: false,
            error: 'Session not found',
          }
        }

        const raw = readFileSync(filePath, 'utf-8')
        const maxChars = 3000
        const truncated = raw.length > maxChars
          ? raw.slice(0, maxChars) + '\n...(truncated)'
          : raw

        return {
          content: [
            `Session: ${sessionId}`,
            '',
            truncated,
          ].join('\n'),
          success: true,
        }
      }

      default:
        return {
          content: `Unknown action: "${action}". Must be one of: search, sessions, session`,
          success: false,
          error: 'Unknown action',
        }
    }
  },

  userFacingName: () => 'LocalMemoryRecall',
}
