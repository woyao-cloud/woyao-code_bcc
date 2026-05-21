import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'

interface JSONRPCRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

interface JSONRPCNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

type JSONRPCMessage = JSONRPCRequest | JSONRPCResponse | JSONRPCNotification

const SERVER_COMMANDS: Record<string, { command: string; args: string[] }> = {
  typescript: { command: 'typescript-language-server', args: ['--stdio'] },
  javascript: { command: 'typescript-language-server', args: ['--stdio'] },
  python: { command: 'pyright-langserver', args: ['--stdio'] },
}

export class LSPClient {
  private process: ChildProcess | null = null
  private requestId = 0
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()
  private serverName: string
  private capabilities: Record<string, unknown> = {}

  constructor(serverName: string) {
    this.serverName = serverName
  }

  get isConnected(): boolean {
    return this.process !== null && !this.process.killed
  }

  async start(projectRoot: string): Promise<void> {
    const config = SERVER_COMMANDS[this.serverName]
    if (!config) {
      throw new Error(
        `No LSP server configured for: ${this.serverName}. Supported: ${Object.keys(SERVER_COMMANDS).join(', ')}`,
      )
    }

    this.process = spawn(config.command, config.args, {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const rl = createInterface({ input: this.process.stdout! })
    rl.on('line', (line: string) => {
      try {
        const msg = JSON.parse(line) as JSONRPCMessage
        if ('id' in msg && msg.id !== undefined) {
          const pending = this.pending.get(msg.id as number)
          if (pending) {
            this.pending.delete(msg.id as number)
            const resp = msg as JSONRPCResponse
            if (resp.error) {
              pending.reject(new Error(resp.error.message))
            } else {
              pending.resolve(resp.result)
            }
          }
        }
      } catch {
        // skip unparseable messages
      }
    })

    this.process.stderr?.on('data', () => {
      /* ignore stderr */
    })
    this.process.on('error', err => {
      for (const [, p] of this.pending) p.reject(err)
      this.pending.clear()
    })

    // Initialize
    const initResult = (await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${projectRoot}`,
      capabilities: {
        textDocument: {
          hover: { dynamicRegistration: true },
          definition: { dynamicRegistration: true },
          references: { dynamicRegistration: true },
          completion: { completionItem: { snippetSupport: true } },
        },
      },
    })) as Record<string, unknown>

    this.capabilities =
      (initResult?.capabilities as Record<string, unknown>) ?? {}

    await this.sendNotification('initialized', {})
  }

  async stop(): Promise<void> {
    if (!this.process) return
    try {
      await this.sendNotification('exit', {})
    } catch {
      /* ignore */
    }
    this.process.kill()
    this.process = null
  }

  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const msg: JSONRPCRequest = { jsonrpc: '2.0', id, method, params }
      this.write(msg)
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`LSP request timed out: ${method}`))
        }
      }, 15000)
    })
  }

  private async sendNotification(
    method: string,
    params?: unknown,
  ): Promise<void> {
    const msg: JSONRPCNotification = { jsonrpc: '2.0', method, params }
    this.write(msg)
  }

  private write(msg: JSONRPCMessage): void {
    if (!this.process?.stdin) return
    const content = JSON.stringify(msg)
    // LSP uses Content-Length headers
    const header = `Content-Length: ${Buffer.byteLength(content, 'utf-8')}\r\n\r\n`
    this.process.stdin.write(header + content)
  }

  // --- High-level LSP operations ---

  async getHover(filePath: string, line: number, col: number): Promise<string> {
    const result = (await this.sendRequest('textDocument/hover', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character: col },
    })) as { contents?: { value?: string; kind?: string } | string }

    if (!result) return ''
    const contents = result.contents
    if (typeof contents === 'string') return contents
    if (contents && typeof contents.value === 'string') return contents.value
    return JSON.stringify(contents ?? '')
  }

  async getDefinition(
    filePath: string,
    line: number,
    col: number,
  ): Promise<string> {
    const result = (await this.sendRequest('textDocument/definition', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character: col },
    })) as
      | Array<{ uri?: string; range?: { start?: { line?: number } } }>
      | { uri?: string; range?: { start?: { line?: number } } }

    if (!result) return 'No definition found.'
    const locs = Array.isArray(result) ? result : [result]
    return locs
      .filter(l => l?.uri)
      .map(
        l =>
          `${l.uri!.replace(/^file:\/\//, '')}:${(l.range?.start?.line ?? 0) + 1}`,
      )
      .join('\n')
  }

  async getReferences(
    filePath: string,
    line: number,
    col: number,
  ): Promise<string> {
    const result = (await this.sendRequest('textDocument/references', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character: col },
      context: { includeDeclaration: true },
    })) as Array<{ uri?: string; range?: { start?: { line?: number } } }>

    if (!result || result.length === 0) return 'No references found.'
    return result
      .filter(l => l?.uri)
      .map(
        l =>
          `${l.uri!.replace(/^file:\/\//, '')}:${(l.range?.start?.line ?? 0) + 1}`,
      )
      .join('\n')
  }

  async getCompletions(
    filePath: string,
    line: number,
    col: number,
  ): Promise<string> {
    const result = (await this.sendRequest('textDocument/completion', {
      textDocument: { uri: `file://${filePath}` },
      position: { line, character: col },
    })) as
      | { items?: Array<{ label: string; detail?: string }> }
      | Array<{ label: string; detail?: string }>
      | null

    if (!result) return 'No completions available.'
    const items = Array.isArray(result)
      ? result
      : (result as { items?: Array<{ label: string; detail?: string }> }).items
    if (!items || items.length === 0) return 'No completions available.'
    return items
      .slice(0, 20)
      .map(i => `${i.label}${i.detail ? ` — ${i.detail}` : ''}`)
      .join('\n')
  }
}
