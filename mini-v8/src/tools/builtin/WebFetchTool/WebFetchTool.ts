import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'

const MAX_RESPONSE_SIZE = 500_000

export const WebFetchTool: Tool = {
  name: 'WebFetch',
  description:
    'Fetches content from a URL and processes into markdown. ' +
    'Fetches content from a URL and processes it using an AI model. ' +
    'Takes a URL and a fetchInfo as input. Fetches the URL content, ' +
    'converts HTML to markdown, and returns the model response about the content.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch content from' },
      fetchInfo: {
        type: 'string',
        description: 'The information user want to fetch',
      },
    },
    required: ['url', 'fetchInfo'],
  },
  prompt: 'WebFetch tool for fetching web page content.',
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const url = String(input.url ?? '')
    const fetchInfo = String(input.fetchInfo ?? '')

    if (!url.trim()) {
      return {
        content: 'No URL provided',
        success: false,
        error: 'Missing URL',
      }
    }

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return {
        content: `Invalid URL: ${url}`,
        success: false,
        error: 'Invalid URL',
      }
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        content: `Unsupported protocol: ${parsedUrl.protocol}`,
        success: false,
        error: 'Protocol not supported',
      }
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ClaudeCodeMini/2.0',
          Accept: 'text/html, text/plain, */*',
        },
        signal: ctx.abortSignal,
        redirect: 'follow',
      })

      if (!response.ok) {
        return {
          content: `HTTP ${response.status}: ${response.statusText}`,
          success: false,
          error: `HTTP ${response.status}`,
        }
      }

      const contentType = response.headers.get('content-type') || ''

      if (contentType.includes('text/html')) {
        const html = await response.text()
        const markdown = htmlToMarkdown(html)
        const truncated = markdown.slice(0, MAX_RESPONSE_SIZE)
        const summary = truncateStr(fetchInfo, 500)

        return {
          content: `Fetch info: ${summary}\n\nContent from ${url}:\n${truncated}${
            markdown.length > MAX_RESPONSE_SIZE
              ? '\n\n[Content truncated...]'
              : ''
          }`,
          success: true,
        }
      } else if (
        contentType.includes('text/') ||
        contentType.includes('application/json')
      ) {
        const text = await response.text()
        return {
          content: `Content from ${url}:\n${text.slice(0, MAX_RESPONSE_SIZE)}`,
          success: true,
        }
      } else {
        return {
          content: `Unsupported content type: ${contentType}`,
          success: false,
          error: 'Unsupported content type',
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('abort')) {
        return {
          content: 'Request timed out',
          success: false,
          error: 'Timeout',
        }
      }
      return {
        content: `Fetch failed: ${msg}`,
        success: false,
        error: msg,
      }
    }
  },

  userFacingName: () => 'WebFetch',
}

function truncateStr(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str
}

/**
 * Simple HTML to markdown converter.
 * Strips tags and decodes entities. Not a full converter, but good enough.
 */
function htmlToMarkdown(html: string): string {
  let text = html

  // Remove scripts and styles
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

  // Convert headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
  text = text.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, '**$1**\n\n')

  // Convert lists
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')

  // Convert paragraphs
  text = text.replace(/<p[^>]*>/gi, '')
  text = text.replace(/<\/p>/gi, '\n\n')

  // Convert line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // Bold and italic
  text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, '**$2**')
  text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, '*$2*')

  // Links
  text = text.replace(
    /<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    '[$2]($1)',
  )

  // Images
  text = text.replace(
    /<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi,
    '![$2]($1)',
  )
  text = text.replace(
    /<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi,
    '![$1]($2)',
  )

  // Code blocks
  text = text.replace(
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    '```\n$1\n```\n',
  )
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode entities
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, ' ')

  // Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/^\s+|\s+$/g, '')

  return text
}
