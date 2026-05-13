// ============================================================
// Memory REPL Commands for mini-v7
// ============================================================

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

/**
 * Handle /memory commands in the REPL.
 */
export async function handleMemoryCommand(
  args: string,
  messages: BetaMessageParam[],
): Promise<string> {
  const trimmed = args.trim()

  if (!trimmed || trimmed === 'help') {
    return memoryHelp()
  }

  // Add memory
  if (trimmed.startsWith('add ')) {
    const content = trimmed.slice('add '.length).trim()
    return memoryAdd(content)
  }

  // List memories
  if (trimmed === 'list') {
    return memoryList()
  }

  // Search memories
  if (trimmed.startsWith('search ')) {
    const query = trimmed.slice('search '.length).trim()
    return memorySearch(query)
  }

  // Delete a memory
  if (trimmed.startsWith('delete ') || trimmed.startsWith('rm ')) {
    const id = trimmed.slice(trimmed.indexOf(' ') + 1).trim()
    return memoryDelete(id)
  }

  // Get memory categories
  if (trimmed === 'categories') {
    return memoryCategories()
  }

  // Get memory tags
  if (trimmed === 'tags') {
    return memoryTags()
  }

  // Export memories
  if (trimmed.startsWith('export')) {
    const format = trimmed.includes('markdown')
      ? ('markdown' as const)
      : ('json' as const)
    return memoryExport(format)
  }

  // Import memories
  if (trimmed.startsWith('import ')) {
    const jsonData = trimmed.slice('import '.length).trim()
    return memoryImport(jsonData)
  }

  // Session memory extraction (manual trigger)
  if (trimmed === 'extract') {
    return memoryExtract(messages)
  }

  return `Unknown memory command: ${trimmed}\nUse /memory help for usage.`
}

function memoryHelp(): string {
  return [
    'Memory commands:',
    '  /memory add <content>     - Add a memory entry',
    '  /memory list              - List all memories',
    '  /memory search <query>    - Search memories',
    '  /memory delete <id>       - Delete a memory',
    '  /memory categories        - List all categories',
    '  /memory tags              - List all tags',
    '  /memory export [markdown] - Export memories (JSON default)',
    '  /memory import <json>     - Import memories from JSON',
    '  /memory extract           - Manually trigger session memory extraction',
  ].join('\n')
}

async function memoryAdd(content: string): Promise<string> {
  const { addMemory } = await import('../services/memory/memoryStore.js')

  // Try to auto-detect category and tags from content
  let category = 'general'
  let tags: string[] = []

  if (
    content.toLowerCase().includes('todo') ||
    content.toLowerCase().includes('task')
  ) {
    category = 'task'
    tags.push('todo')
  } else if (
    content.toLowerCase().includes('decision') ||
    content.toLowerCase().includes('decide')
  ) {
    category = 'decision'
    tags.push('decision')
  } else if (
    content.toLowerCase().includes('fix') ||
    content.toLowerCase().includes('bug')
  ) {
    category = 'bug'
    tags.push('bug')
  } else if (
    content.toLowerCase().includes('note') ||
    content.toLowerCase().includes('remember')
  ) {
    category = 'note'
  }

  const memory = addMemory(content, tags, category)
  if (!memory) return 'Failed to add memory.'
  return `Memory added: ${memory.id} [${category}] ${content.slice(0, 80)}...`
}

async function memoryList(): Promise<string> {
  const { getMemories } = await import('../services/memory/memoryStore.js')
  const memories = getMemories()
  if (memories.length === 0) return 'No memories stored.'

  const lines = [`${memories.length} memories:`, '']
  for (const m of memories.slice(-15).reverse()) {
    const tagStr = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : ''
    lines.push(`  ${m.id} (${m.category})${tagStr}: ${m.content.slice(0, 100)}`)
  }
  return lines.join('\n')
}

async function memorySearch(query: string): Promise<string> {
  const { searchMemories } = await import('../services/memory/memoryStore.js')
  const results = searchMemories(query)
  if (results.length === 0) return `No memories found matching "${query}".`

  const lines = [`${results.length} memories matching "${query}":`, '']
  for (const m of results.slice(0, 10)) {
    lines.push(`  ${m.id} (${m.category}): ${m.content.slice(0, 100)}`)
  }
  return lines.join('\n')
}

async function memoryDelete(id: string): Promise<string> {
  const { deleteMemory } = await import('../services/memory/memoryStore.js')
  const ok = deleteMemory(id)
  return ok ? `Memory ${id} deleted.` : `Memory ${id} not found.`
}

async function memoryCategories(): Promise<string> {
  const { getAllCategories } = await import('../services/memory/memoryStore.js')
  const cats = getAllCategories()
  if (cats.length === 0) return 'No categories.'
  return `Categories: ${cats.join(', ')}`
}

async function memoryTags(): Promise<string> {
  const { getAllTags } = await import('../services/memory/memoryStore.js')
  const tags = getAllTags()
  if (tags.length === 0) return 'No tags.'
  return `Tags: ${tags.join(', ')}`
}

async function memoryExport(format: 'json' | 'markdown'): Promise<string> {
  const { exportMemories } = await import('../services/memory/memoryStore.js')
  const data = exportMemories(format)
  return `Exported ${format} data:\n${data.slice(0, 500)}${data.length > 500 ? '...' : ''}`
}

async function memoryImport(jsonData: string): Promise<string> {
  const { importMemories } = await import('../services/memory/memoryStore.js')
  const count = importMemories(jsonData)
  return `Imported ${count} memories.`
}

async function memoryExtract(messages: BetaMessageParam[]): Promise<string> {
  const { extractSessionNotes, persistSessionMemory, getSessionId } =
    await import('../services/memory/sessionMemory.js')
  const id = getSessionId()
  if (!id)
    return 'No active session. Session memory extraction requires an active session.'

  const notes = extractSessionNotes(messages)
  persistSessionMemory(notes)
  return [
    `Session memory extracted: ${notes.length} notes persisted.`,
    `Session: ${id}`,
    notes.length > 0
      ? `Categories: ${[...new Set(notes.map(n => n.category))].join(', ')}`
      : 'No significant notes found in current conversation.',
  ].join('\n')
}

// ============================================================
// Session Memory commands
// ============================================================

export async function handleSessionMemoryCommand(
  args: string,
): Promise<string> {
  const trimmed = args.trim()

  if (!trimmed || trimmed === 'help') {
    return [
      'Session Memory commands:',
      '  /session-memory on           - Enable auto-extraction',
      '  /session-memory off          - Disable auto-extraction',
      '  /session-memory status       - Show current status',
      '  /session-memory config       - Show current config',
      '  /session-memory view [id]    - View session memory file content',
    ].join('\n')
  }

  if (trimmed === 'on') {
    const { setSessionMemoryConfig } = await import(
      '../services/memory/sessionMemory.js'
    )
    setSessionMemoryConfig({ enabled: true })
    return 'Session Memory: enabled. Notes will be auto-extracted during conversation.'
  }

  if (trimmed === 'off') {
    const { setSessionMemoryConfig } = await import(
      '../services/memory/sessionMemory.js'
    )
    setSessionMemoryConfig({ enabled: false })
    return 'Session Memory: disabled.'
  }

  if (trimmed === 'status') {
    const { getSessionMemoryConfig, getSessionId } = await import(
      '../services/memory/sessionMemory.js'
    )
    const config = getSessionMemoryConfig()
    const id = getSessionId()
    return [
      `Session Memory: ${config.enabled ? 'enabled' : 'disabled'}`,
      `Session ID: ${id || 'none'}`,
      `Min tokens for init: ${config.minTokensForInit}`,
      `Min tokens between updates: ${config.minTokensBetweenUpdate}`,
      `Max notes: ${config.maxNotes}`,
    ].join('\n')
  }

  if (trimmed === 'config') {
    const { getSessionMemoryConfig } = await import(
      '../services/memory/sessionMemory.js'
    )
    return JSON.stringify(getSessionMemoryConfig(), null, 2)
  }

  if (trimmed.startsWith('view')) {
    const viewArgs = trimmed.slice('view'.length).trim()
    const { readSessionMemory, getSessionMemoryForPrompt } = await import(
      '../services/memory/sessionMemory.js'
    )
    const id = viewArgs || (await getSessionMemoryForPrompt).toString()
    const notes = readSessionMemory(id)
    if (notes.length === 0) return `No session memory found for: ${id}`

    const lines = [`Session Memory (${id}):`, '']
    for (const n of notes) {
      lines.push(`[${n.category}] ${n.content}`)
    }
    return lines.join('\n')
  }

  return `Unknown session-memory command: ${trimmed}. Use on, off, status, config, or view.`
}

// ============================================================
// Memory Stores commands
// ============================================================

export async function handleMemoryStoresCommand(args: string): Promise<string> {
  const trimmed = args.trim()

  if (!trimmed || trimmed === 'help') {
    return [
      'Memory Stores (cloud) commands:',
      '  /memory-stores list               - List all stores',
      '  /memory-stores create <name>      - Create a store',
      '  /memory-stores get <id>           - Get store details',
      '  /memory-stores archive <id>       - Archive a store',
      '  /memory-stores memories <storeId> - List memories in a store',
    ].join('\n')
  }

  if (trimmed === 'list') {
    try {
      const { listStores } = await import(
        '../services/memory/memoryStoresClient.js'
      )
      const stores = await listStores()
      if (stores.length === 0) return 'No memory stores found.'

      const lines = [`${stores.length} memory stores:`, '']
      for (const s of stores) {
        const archived = s.archived_at ? ' [archived]' : ''
        lines.push(`  ${s.memory_store_id}: ${s.name}${archived}`)
      }
      return lines.join('\n')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Failed to list stores: ${msg}\nNote: Requires ANTHROPIC_API_KEY and a Claude subscription.`
    }
  }

  if (trimmed.startsWith('create ')) {
    try {
      const name = trimmed.slice('create '.length).trim()
      const { createStore } = await import(
        '../services/memory/memoryStoresClient.js'
      )
      const store = await createStore(name)
      return `Memory store created: ${store.memory_store_id} (${store.name})`
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Failed to create store: ${msg}`
    }
  }

  if (trimmed.startsWith('get ')) {
    try {
      const id = trimmed.slice('get '.length).trim()
      const { getStore } = await import(
        '../services/memory/memoryStoresClient.js'
      )
      const store = await getStore(id)
      return [
        `Store: ${store.name}`,
        `ID: ${store.memory_store_id}`,
        `Created: ${store.created_at || 'N/A'}`,
        `Archived: ${store.archived_at || 'no'}`,
      ].join('\n')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Failed to get store: ${msg}`
    }
  }

  if (trimmed.startsWith('archive ')) {
    try {
      const id = trimmed.slice('archive '.length).trim()
      const { archiveStore } = await import(
        '../services/memory/memoryStoresClient.js'
      )
      const store = await archiveStore(id)
      return `Store archived: ${store.name} (${store.memory_store_id})`
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Failed to archive store: ${msg}`
    }
  }

  if (trimmed.startsWith('memories ')) {
    try {
      const storeId = trimmed.slice('memories '.length).trim()
      const { listMemories } = await import(
        '../services/memory/memoryStoresClient.js'
      )
      const memories = await listMemories(storeId)
      if (memories.length === 0) return 'No memories in this store.'

      const lines = [`${memories.length} memories in store ${storeId}:`, '']
      for (const m of memories) {
        lines.push(`  ${m.memory_id}: ${m.content.slice(0, 120)}`)
      }
      return lines.join('\n')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return `Failed to list memories: ${msg}`
    }
  }

  return `Unknown memory-stores command: ${trimmed}. Use /memory-stores help.`
}

// ============================================================
// Team Memory commands
// ============================================================

export async function handleTeamMemoryCommand(args: string): Promise<string> {
  const trimmed = args.trim()

  if (!trimmed || trimmed === 'help') {
    return [
      'Team Memory Sync commands:',
      '  /sync-memory on                    - Enable team memory sync',
      '  /sync-memory off                   - Disable team memory sync',
      '  /sync-memory status                - Show sync status',
      '  /sync-memory repo <owner/repo>     - Set git repo for scoping',
      '  /sync-memory pull                  - Pull from server',
      '  /sync-memory push                  - Push to server',
      '  /sync-memory sync                  - Full bidirectional sync',
      '  /sync-memory list                  - List local team memories',
    ].join('\n')
  }

  if (trimmed === 'on') {
    const { setTeamSyncConfig } = await import(
      '../services/memory/teamMemorySync.js'
    )
    setTeamSyncConfig({ enabled: true })
    return 'Team Memory Sync: enabled.'
  }

  if (trimmed === 'off') {
    const { setTeamSyncConfig } = await import(
      '../services/memory/teamMemorySync.js'
    )
    setTeamSyncConfig({ enabled: false })
    return 'Team Memory Sync: disabled.'
  }

  if (trimmed === 'status') {
    const { getTeamSyncConfig } = await import(
      '../services/memory/teamMemorySync.js'
    )
    const config = getTeamSyncConfig()
    return [
      `Team Memory Sync: ${config.enabled ? 'enabled' : 'disabled'}`,
      `Repo: ${config.repoSlug || 'not set'}`,
      `Max file size: ${config.maxFileSize}`,
    ].join('\n')
  }

  if (trimmed.startsWith('repo ')) {
    const repo = trimmed.slice('repo '.length).trim()
    const { setTeamSyncConfig } = await import(
      '../services/memory/teamMemorySync.js'
    )
    setTeamSyncConfig({ repoSlug: repo })
    return `Team memory repo set to: ${repo}`
  }

  if (trimmed === 'pull') {
    const { createSyncState, pullTeamMemory } = await import(
      '../services/memory/teamMemorySync.js'
    )
    const state = createSyncState()
    const result = await pullTeamMemory(state)
    return result.success
      ? `Pulled ${result.filesWritten} team memories from server.`
      : `Pull failed: ${result.error || 'unknown error'}`
  }

  if (trimmed === 'push') {
    const { createSyncState, pushTeamMemory } = await import(
      '../services/memory/teamMemorySync.js'
    )
    const state = createSyncState()
    const result = await pushTeamMemory(state)
    return result.success
      ? `Pushed ${result.filesUploaded} team memories to server.`
      : `Push failed: ${result.error || 'unknown error'}`
  }

  if (trimmed === 'sync') {
    const { createSyncState, syncTeamMemory } = await import(
      '../services/memory/teamMemorySync.js'
    )
    const state = createSyncState()
    const result = await syncTeamMemory(state)
    return result.success
      ? `Sync complete: ${result.filesPulled} pulled, ${result.filesPushed} pushed.`
      : `Sync failed: ${result.error || 'unknown error'}`
  }

  if (trimmed === 'list') {
    const { scanLocalTeamMemories } = await import(
      '../services/memory/teamMemorySync.js'
    )
    const entries = scanLocalTeamMemories()
    if (entries.length === 0) return 'No local team memories.'

    const lines = [`${entries.length} team memories:`, '']
    for (const e of entries) {
      lines.push(
        `  ${e.key} (${e.content.length} chars, ${e.checksum.slice(0, 12)})`,
      )
    }
    return lines.join('\n')
  }

  return `Unknown sync-memory command: ${trimmed}. Use /sync-memory help.`
}
