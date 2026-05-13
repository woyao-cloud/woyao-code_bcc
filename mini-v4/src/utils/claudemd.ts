import { existsSync, readFileSync } from 'fs'
import { join, dirname, parse } from 'path'

/**
 * Discover and load CLAUDE.md and AGENTS.md files from the project hierarchy
 */
export function loadClaudeMdFiles(
  cwd: string,
): { path: string; content: string }[] {
  const results: { path: string; content: string }[] = []
  const files = findClaudeMdFiles(cwd)

  for (const file of files) {
    try {
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf-8')
        results.push({ path: file, content })
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results
}

/**
 * Find all CLAUDE.md / AGENTS.md files up the directory tree
 */
function findClaudeMdFiles(cwd: string): string[] {
  const files: string[] = []
  const fileNames = ['CLAUDE.md', 'AGENTS.md', 'CLAUDE.local.md']

  // Walk up from cwd to root
  let dir = cwd
  const root = parse(dir).root

  while (dir !== root) {
    for (const name of fileNames) {
      const path = join(dir, name)
      if (existsSync(path)) {
        files.push(path)
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return files.reverse()
}
