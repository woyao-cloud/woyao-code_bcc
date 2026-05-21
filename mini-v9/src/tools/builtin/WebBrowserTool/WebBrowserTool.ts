import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'

interface CookieJarEntry {
  name: string
  value: string
  domain: string
}

let cookieJar: CookieJarEntry[] = []
let sessionHeaders: Record<string, string> = {}

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
}

function extractCookies(
  setCookieHeader: string | string[] | undefined,
  domain: string,
): void {
  if (!setCookieHeader) return
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : [setCookieHeader]
  for (const c of cookies) {
    const [nameVal] = c.split(';')
    const [name, ...valParts] = nameVal.split('=')
    if (name && valParts.length > 0) {
      const idx = cookieJar.findIndex(
        e => e.name === name.trim() && e.domain === domain,
      )
      const entry: CookieJarEntry = {
        name: name.trim(),
        value: valParts.join('='),
        domain,
      }
      if (idx >= 0) cookieJar[idx] = entry
      else cookieJar.push(entry)
    }
  }
}

function buildCookieHeader(url: string): string {
  try {
    const domain = new URL(url).hostname
    return cookieJar
      .filter(e => domain.endsWith(e.domain) || e.domain === domain)
      .map(e => `${e.name}=${e.value}`)
      .join('; ')
  } catch {
    return ''
  }
}

export const WebBrowserTool: Tool = {
  name: 'WebBrowser',
  description:
    'Browse the web with browser-like headers and cookie/session support. Supports navigating to URLs, reading page content, and managing browser session state.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to navigate to' },
      action: {
        type: 'string',
        enum: ['navigate', 'clear_cookies', 'clear_session'],
        description: 'Action to perform',
      },
    },
    required: ['url', 'action'],
  },
  prompt:
    'WebBrowser tool: browse the web with browser emulation. Supports cookies and session persistence.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const action = String(input.action ?? 'navigate')
      .trim()
      .toLowerCase()

    if (action === 'clear_cookies') {
      cookieJar = []
      return { content: 'Cookies cleared.', success: true }
    }

    if (action === 'clear_session') {
      cookieJar = []
      sessionHeaders = {}
      return { content: 'Session state cleared.', success: true }
    }

    const urlStr = String(input.url ?? '').trim()
    if (!urlStr)
      return {
        content: 'URL is required',
        success: false,
        error: 'Missing url',
      }

    let url: URL
    try {
      url = new URL(urlStr)
    } catch {
      return {
        content: `Invalid URL: ${urlStr}`,
        success: false,
        error: 'Invalid URL',
      }
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      return {
        content: `Unsupported protocol: ${url.protocol}. Only http/https allowed.`,
        success: false,
        error: 'Unsupported protocol',
      }
    }

    try {
      const headers: Record<string, string> = {
        ...BROWSER_HEADERS,
        ...sessionHeaders,
      }
      const cookieHeader = buildCookieHeader(urlStr)
      if (cookieHeader) headers['Cookie'] = cookieHeader

      const response = await fetch(urlStr, {
        method: 'GET',
        headers,
        redirect: 'follow',
      })
      const setCookie = response.headers.get('set-cookie')
      if (setCookie) extractCookies(setCookie, url.hostname)

      const contentType = response.headers.get('content-type') || ''
      const isHtml = contentType.includes('text/html')
      const text = await response.text()
      const truncated = text.length > 10000
      const content = truncated
        ? text.slice(0, 10000) + '\n... [truncated at 10000 chars]'
        : text

      if (isHtml) {
        const stripped = content
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 5000)
        const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i)
        const title = titleMatch ? titleMatch[1].trim() : ''
        return {
          content: [
            `URL: ${urlStr}`,
            `Status: ${response.status}`,
            title ? `Title: ${title}` : '',
            '',
            stripped,
          ].join('\n'),
          success: true,
        }
      }

      return {
        content: `URL: ${urlStr}\nStatus: ${response.status}\nContent-Type: ${contentType}\n\n${text.slice(0, 3000)}`,
        success: true,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        content: `Error fetching ${urlStr}: ${msg}`,
        success: false,
        error: msg,
      }
    }
  },
  userFacingName: () => 'WebBrowser',
}
