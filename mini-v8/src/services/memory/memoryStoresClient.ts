// ============================================================
// Memory Stores Cloud API Client for mini-v7
// ============================================================

// ============================================================
// Types
// ============================================================

export interface CloudMemoryStore {
  memory_store_id: string
  name: string
  namespace?: string
  archived_at?: string | null
  created_at?: string
}

export interface CloudMemory {
  memory_id: string
  memory_store_id: string
  content: string
  created_at?: string
  updated_at?: string
}

export interface CloudMemoryVersion {
  version_id: string
  memory_store_id: string
  created_at?: string
  redacted_at?: string | null
}

export interface MemoryStoresConfig {
  baseUrl: string
  apiKey?: string
}

// ============================================================
// Config
// ============================================================

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1/memory_stores'

function getConfig(): MemoryStoresConfig {
  return {
    baseUrl: process.env.MEMORY_STORES_URL || DEFAULT_BASE_URL,
    apiKey: process.env.ANTHROPIC_API_KEY || undefined,
  }
}

// ============================================================
// HTTP helpers
// ============================================================

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const config = getConfig()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'managed-agents-2026-04-01',
  }
  if (config.apiKey) {
    headers['x-api-key'] = config.apiKey
  }

  const url = `${config.baseUrl}${path}`
  const init: RequestInit = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }

  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(
      `Memory Stores API error: ${response.status} ${response.statusText}`,
    )
  }
  return response.json() as Promise<T>
}

// ============================================================
// Store CRUD
// ============================================================

/** List all memory stores */
export async function listStores(): Promise<CloudMemoryStore[]> {
  const data = await apiRequest<{ data: CloudMemoryStore[] }>('GET', '')
  return data.data ?? []
}

/** Create a new memory store */
export async function createStore(
  name: string,
  namespace?: string,
): Promise<CloudMemoryStore> {
  const body: { name: string; namespace?: string } = { name }
  if (namespace) body.namespace = namespace
  return apiRequest<CloudMemoryStore>('POST', '', body)
}

/** Get a memory store by ID */
export async function getStore(id: string): Promise<CloudMemoryStore> {
  return apiRequest<CloudMemoryStore>('GET', `/${id}`)
}

/** Archive a memory store (soft delete) */
export async function archiveStore(id: string): Promise<CloudMemoryStore> {
  return apiRequest<CloudMemoryStore>('POST', `/${id}/archive`, {})
}

// ============================================================
// Memory CRUD
// ============================================================

/** List memories in a store */
export async function listMemories(storeId: string): Promise<CloudMemory[]> {
  const data = await apiRequest<{ data: CloudMemory[] }>(
    'GET',
    `/${storeId}/memories`,
  )
  return data.data ?? []
}

/** Create a new memory in a store */
export async function createMemory(
  storeId: string,
  content: string,
): Promise<CloudMemory> {
  return apiRequest<CloudMemory>('POST', `/${storeId}/memories`, { content })
}

/** Get a specific memory */
export async function getMemory(
  storeId: string,
  memoryId: string,
): Promise<CloudMemory> {
  return apiRequest<CloudMemory>('GET', `/${storeId}/memories/${memoryId}`)
}

/** Update a memory content (PATCH) */
export async function updateMemory(
  storeId: string,
  memoryId: string,
  content: string,
): Promise<CloudMemory> {
  return apiRequest<CloudMemory>('PATCH', `/${storeId}/memories/${memoryId}`, {
    content,
  })
}

/** Delete a memory */
export async function deleteMemory(
  storeId: string,
  memoryId: string,
): Promise<void> {
  await apiRequest<void>('DELETE', `/${storeId}/memories/${memoryId}`)
}

// ============================================================
// Versions
// ============================================================

/** List versions for a memory store */
export async function listVersions(
  storeId: string,
): Promise<CloudMemoryVersion[]> {
  const data = await apiRequest<{ data: CloudMemoryVersion[] }>(
    'GET',
    `/${storeId}/memory_versions`,
  )
  return data.data ?? []
}

/** Redact a memory version (PII removal) */
export async function redactVersion(
  storeId: string,
  versionId: string,
): Promise<CloudMemoryVersion> {
  return apiRequest<CloudMemoryVersion>(
    'POST',
    `/${storeId}/memory_versions/${versionId}/redact`,
    {},
  )
}
