/**
 * Minimal MCP (Model Context Protocol) client for mini-v5.
 * Supports local stdio-based MCP servers.
 *
 * MCP config is read from .claude-code-mini/mcp.json:
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "command": "node",
 *       "args": ["server.js"]
 *     }
 *   }
 * }
 */

import { spawn, type ChildProcess } from 'child_process'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface MCPServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

interface JSONRPCRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

class MCPConnection {
  private process: ChildProcess
  private requestId = 0
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >()
  private buffer = ''

  constructor(command: string, args: string[], env?: Record<string, string>) {
    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    })

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      this.processBuffer()
    })

    this.process.stderr?.on('data', (data: Buffer) => {
      // MCP servers may log to stderr
    })

    this.process.on('error', err => {
      for (const [, pending] of this.pending) {
        pending.reject(err)
      }
      this.pending.clear()
    })
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const response = JSON.parse(trimmed) as JSONRPCResponse
        const pending = this.pending.get(response.id)
        if (pending) {
          this.pending.delete(response.id)
          if (response.error) {
            pending.reject(new Error(response.error.message))
          } else {
            pending.resolve(response.result)
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  }

  private async sendRequest(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const id = ++this.requestId
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.process.stdin?.write(JSON.stringify(request) + '\n')
    })
  }

  async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'claude-code-mini', version: '5.0.0' },
    })
    // Send initialized notification
    this.process.stdin?.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
        '\n',
    )
  }

  async listTools(): Promise<MCPTool[]> {
    const result = (await this.sendRequest('tools/list')) as {
      tools: MCPTool[]
    }
    return result.tools || []
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const result = (await this.sendRequest('tools/call', {
      name,
      arguments: args,
    })) as MCPToolResult
    return result
  }

  close(): void {
    this.process.kill()
  }
}

export interface MCPEntry {
  serverName: string
  connection: MCPConnection
  tools: MCPTool[]
}

const mcpConfigPath = join(homedir(), '.claude-code-mini', 'mcp.json')

function loadMCPConfig(): Record<string, MCPServerConfig> {
  try {
    if (!existsSync(mcpConfigPath)) return {}
    const raw = readFileSync(mcpConfigPath, 'utf-8')
    const config = JSON.parse(raw)
    return (config.mcpServers || {}) as Record<string, MCPServerConfig>
  } catch {
    return {}
  }
}

export async function connectMCPServers(): Promise<MCPEntry[]> {
  const config = loadMCPConfig()
  const entries: MCPEntry[] = []

  for (const [serverName, serverConfig] of Object.entries(config)) {
    try {
      const conn = new MCPConnection(
        serverConfig.command,
        serverConfig.args || [],
        serverConfig.env,
      )
      await conn.initialize()
      const tools = await conn.listTools()
      entries.push({ serverName, connection: conn, tools })
    } catch (err) {
      // Skip failed servers
      process.stderr.write(
        'MCP server "' +
          serverName +
          '" failed to start: ' +
          String(err) +
          '\n',
      )
    }
  }

  return entries
}

export function disconnectMCPServers(entries: MCPEntry[]): void {
  for (const entry of entries) {
    try {
      entry.connection.close()
    } catch {}
  }
}
