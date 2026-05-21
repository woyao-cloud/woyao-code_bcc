const MAX_MEMORY_AGE_DAYS = 90
const MAX_MEMORY_FILES = 200
const MAX_MEMORY_TOTAL_SIZE = 10 * 1024 * 1024 // 10MB

export interface MemoryAgeInfo {
  filename: string
  ageDays: number
  size: number
  stale: boolean
}

export function calculateMemoryAge(modifiedAt: Date): number {
  const now = Date.now()
  const age = now - modifiedAt.getTime()
  return Math.floor(age / (1000 * 60 * 60 * 24))
}

export function isMemoryStale(modifiedAt: Date, maxAgeDays?: number): boolean {
  return calculateMemoryAge(modifiedAt) > (maxAgeDays ?? MAX_MEMORY_AGE_DAYS)
}

export function getMemoriesToPrune(
  files: Array<{ filename: string; size: number; modifiedAt: Date }>,
  options?: {
    maxFiles?: number
    maxTotalSize?: number
    maxAgeDays?: number
  },
): string[] {
  const maxFiles = options?.maxFiles ?? MAX_MEMORY_FILES
  const maxSize = options?.maxTotalSize ?? MAX_MEMORY_TOTAL_SIZE
  const maxAge = options?.maxAgeDays ?? MAX_MEMORY_AGE_DAYS

  const toPrune: string[] = []

  // Prune stale files first
  const stale = files.filter(f => isMemoryStale(f.modifiedAt, maxAge))
  for (const f of stale) {
    toPrune.push(f.filename)
  }

  const remaining = files.filter(f => !toPrune.includes(f.filename))

  // Prune by count (oldest first)
  const sortedByAge = [...remaining].sort(
    (a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime(),
  )
  while (sortedByAge.length + toPrune.length > maxFiles) {
    const oldest = sortedByAge.shift()
    if (oldest) toPrune.push(oldest.filename)
  }

  // Prune by total size
  const keptSize = sortedByAge.reduce((s, f) => s + f.size, 0)
  if (keptSize > maxSize) {
    const sortedBySize = [...sortedByAge].sort((a, b) => b.size - a.size)
    let currentSize = keptSize
    for (const f of sortedBySize) {
      if (currentSize <= maxSize) break
      if (!toPrune.includes(f.filename)) {
        toPrune.push(f.filename)
        currentSize -= f.size
      }
    }
  }

  return toPrune
}
