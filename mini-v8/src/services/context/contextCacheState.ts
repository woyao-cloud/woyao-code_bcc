let systemContextCacheRevision = 0

export function invalidateSystemContextCache(): void {
  systemContextCacheRevision += 1
}

export function getSystemContextCacheRevision(): number {
  return systemContextCacheRevision
}
