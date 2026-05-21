import { existsSync } from 'fs'
import { LSPClient } from './client.js'

interface ActiveServer {
  language: string
  client: LSPClient
  projectRoot: string
}

const activeServers: ActiveServer[] = []

function detectLanguage(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'py':
      return 'python'
    default:
      return null
  }
}

export async function getLSPClient(
  filePath: string,
  projectRoot: string,
): Promise<LSPClient | null> {
  const language = detectLanguage(filePath)
  if (!language) return null

  const existing = activeServers.find(
    s => s.language === language && s.projectRoot === projectRoot,
  )
  if (existing) return existing.client

  if (!existsSync(projectRoot)) return null

  const client = new LSPClient(language)
  try {
    await client.start(projectRoot)
    activeServers.push({ language, client, projectRoot })
    return client
  } catch {
    return null
  }
}

export async function stopAllLSPServers(): Promise<void> {
  for (const server of activeServers) {
    try {
      await server.client.stop()
    } catch {
      /* ignore */
    }
  }
  activeServers.length = 0
}

export function getActiveLSPServers(): string[] {
  return activeServers.map(s => `${s.language}@${s.projectRoot}`)
}
