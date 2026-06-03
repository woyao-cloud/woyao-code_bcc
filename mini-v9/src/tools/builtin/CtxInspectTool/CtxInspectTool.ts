/**
 * CtxInspectTool for mini-v9.
 * Reports context window utilization: token counts, message breakdown,
 * largest messages, and estimated remaining capacity.
 */

import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'

// Estimate tokens: ~4 chars per token (standard approximation)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function extractTextFromContent(
  content: string | unknown[],
): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (typeof block === 'string') return block
        if (block && typeof block === 'object') {
          const b = block as Record<string, unknown>
          if (b.type === 'text' && typeof b.text === 'string') return b.text
          if (b.type === 'tool_result' && typeof b.content === 'string') return b.content
        }
        return ''
      })
      .join(' ')
  }
  return ''
}

interface MessageInfo {
  role: string
  estimatedTokens: number
  contentLength: number
  type: string
}

export const CtxInspectTool: Tool = {
  name: 'CtxInspect',
  description:
    'Inspect the current conversation context window. ' +
    'Reports total estimated tokens, per-role breakdown, largest messages, ' +
    'and estimated remaining context capacity. ' +
    'Useful for understanding context pressure before starting expensive operations.',
  inputSchema: {
    type: 'object',
    properties: {
      detail: {
        type: 'string',
        enum: ['summary', 'full'],
        description: 'Detail level: "summary" for overview, "full" for per-message breakdown',
      },
      top: {
        type: 'number',
        description: 'Number of largest messages to list (default: 5)',
      },
    },
    required: [],
  },
  prompt:
    'CtxInspect tool: check the current context window. ' +
    'Use detail:"full" to see per-message breakdown, ' +
    'or omit it for a summary. Useful before starting expensive agent operations.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const messages = ctx.messages
    const detail = String(input.detail ?? 'summary')
    const topN = typeof input.top === 'number' ? Math.max(1, Math.min(20, input.top)) : 5

    if (!messages || messages.length === 0) {
      return {
        content: 'No messages in current context.',
        success: true,
      }
    }

    // Analyze all messages
    const messageInfos: MessageInfo[] = messages.map(msg => {
      const m = msg as unknown as Record<string, unknown>
      const role = String((m.role as string | undefined) ?? m.type ?? 'unknown')
      // Messages may have content at msg.content or msg.message.content (nested structure)
      const content = (m.message as Record<string, unknown> | undefined)?.content ?? m.content
      const text = extractTextFromContent(content as string | unknown[])
      return {
        role,
        estimatedTokens: estimateTokens(text),
        contentLength: text.length,
        type: String(msg.type ?? role),
      }
    })

    const totalTokens = messageInfos.reduce((sum, m) => sum + m.estimatedTokens, 0)
    const totalChars = messageInfos.reduce((sum, m) => sum + m.contentLength, 0)

    // Per-role breakdown
    const byRole = new Map<string, { count: number; tokens: number }>()
    for (const info of messageInfos) {
      const entry = byRole.get(info.role) ?? { count: 0, tokens: 0 }
      entry.count++
      entry.tokens += info.estimatedTokens
      byRole.set(info.role, entry)
    }

    // Find largest messages
    const sortedBySize = [...messageInfos].sort((a, b) => b.estimatedTokens - a.estimatedTokens)
    const largest = sortedBySize.slice(0, topN)

    // Context window estimate (200K default for Claude)
    const estimatedWindow = 200_000
    const usedPct = Math.round((totalTokens / estimatedWindow) * 100)
    const remainingPct = Math.max(0, 100 - usedPct)

    const parts: string[] = [
      '## Context Window Inspection',
      '',
      `Total messages: ${messages.length}`,
      `Estimated tokens: ~${totalTokens.toLocaleString()}`,
      `Estimated chars: ~${totalChars.toLocaleString()}`,
      `Context used: ${usedPct}% (of ~${estimatedWindow.toLocaleString()} token window)`,
      `Estimated remaining: ${remainingPct}%`,
      '',
      '### Per-Role Breakdown',
      '',
    ]

    for (const [role, info] of byRole.entries()) {
      const pct = totalTokens > 0 ? Math.round((info.tokens / totalTokens) * 100) : 0
      parts.push(`  ${role}: ${info.count} messages, ~${info.tokens.toLocaleString()} tokens (${pct}%)`)
    }

    if (detail === 'full') {
      parts.push('', `### Top ${topN} Largest Messages`, '')
      for (let i = 0; i < largest.length; i++) {
        const msg = largest[i]
        parts.push(
          `  ${i + 1}. [${msg.role}] ~${msg.estimatedTokens.toLocaleString()} tokens` +
            ` (type: ${msg.type})`,
        )
      }
    }

    return {
      content: parts.join('\n'),
      success: true,
      metadata: {
        totalMessages: messages.length,
        estimatedTokens: totalTokens,
        contextUsedPct: usedPct,
      },
    }
  },

  userFacingName: () => 'CtxInspect',
}
