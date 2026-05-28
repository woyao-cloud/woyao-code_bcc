import { describe, expect, test } from 'bun:test'
import {
  normalizeRemoteUrl,
  hashRemoteUrl,
  GitStatus,
  getGithubRepo,
  FileStatusEntry,
} from '../utils/git.js'
import {
  parseGitNumstat,
  parseGitDiff,
  parseShortstat,
} from '../utils/gitDiff.js'

// Unit tests for pure functions (no git repo required)

describe('normalizeRemoteUrl', () => {
  test('removes .git suffix', () => {
    expect(normalizeRemoteUrl('https://github.com/user/repo.git')).toBe(
      'https://github.com/user/repo',
    )
  })

  test('converts SSH URL to HTTPS', () => {
    expect(normalizeRemoteUrl('git@github.com:user/repo.git')).toBe(
      'https://github.com/user/repo',
    )
  })

  test('converts to lowercase', () => {
    expect(normalizeRemoteUrl('HTTPS://GITHUB.COM/USER/REPO')).toBe(
      'https://github.com/user/repo',
    )
  })

  test('handles already normalized URL', () => {
    expect(normalizeRemoteUrl('https://github.com/user/repo')).toBe(
      'https://github.com/user/repo',
    )
  })

  test('handles URL with trailing slash', () => {
    expect(normalizeRemoteUrl('https://github.com/user/repo/')).toBe(
      'https://github.com/user/repo/',
    )
  })
})

describe('hashRemoteUrl', () => {
  test('generates consistent hash', () => {
    const url = 'https://github.com/user/repo.git'
    const hash1 = hashRemoteUrl(url)
    const hash2 = hashRemoteUrl(url)
    expect(hash1).toBe(hash2)
  })

  test('generates same hash for equivalent URLs', () => {
    const httpsUrl = 'https://github.com/user/repo.git'
    const sshUrl = 'git@github.com:user/repo'
    expect(hashRemoteUrl(httpsUrl)).toBe(hashRemoteUrl(sshUrl))
  })

  test('generates different hashes for different repos', () => {
    const url1 = 'https://github.com/user/repo1.git'
    const url2 = 'https://github.com/user/repo2.git'
    expect(hashRemoteUrl(url1)).not.toBe(hashRemoteUrl(url2))
  })

  test('produces 8-character hex string', () => {
    const hash = hashRemoteUrl('https://github.com/user/repo.git')
    expect(hash.length).toBe(8)
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('GitStatus interface', () => {
  test('has correct structure', () => {
    const status: GitStatus = {
      isGit: true,
      root: '/path/to/repo',
      branch: 'main',
      commit: 'abc123',
      shortCommit: 'abc',
      defaultBranch: 'main',
      remoteUrl: 'https://github.com/user/repo.git',
      normalizedRemoteUrl: 'https://github.com/user/repo',
      remoteUrlHash: 'abc12345',
      isClean: true,
      hasStagedChanges: false,
      hasUnstagedChanges: false,
      hasUntrackedFiles: false,
      ahead: 0,
      behind: 0,
      hasUnpushedCommits: false,
    }

    expect(typeof status.isGit).toBe('boolean')
    expect(typeof status.root).toBe('string')
    expect(typeof status.branch).toBe('string')
    expect(typeof status.commit).toBe('string')
    expect(typeof status.ahead).toBe('number')
    expect(typeof status.behind).toBe('number')
  })
})

// ============================================================
// getGithubRepo tests
// ============================================================

describe('getGithubRepo', () => {
  test('extracts from HTTPS URL', () => {
    const result = getGithubRepo('https://github.com/owner/repo.git')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  test('extracts from SSH URL', () => {
    const result = getGithubRepo('git@github.com:owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })

  test('returns null for non-GitHub URL', () => {
    expect(getGithubRepo('https://gitlab.com/owner/repo')).toBeNull()
  })

  test('handles www prefix', () => {
    const result = getGithubRepo('https://www.github.com/owner/repo')
    expect(result).toEqual({ owner: 'owner', repo: 'repo' })
  })
})

// ============================================================
// parseGitNumstat tests
// ============================================================

describe('parseGitNumstat', () => {
  test('parses single file', () => {
    const result = parseGitNumstat('1\t2\tsrc/file.ts')
    expect(result.stats).toEqual({ filesCount: 1, linesAdded: 1, linesRemoved: 2 })
    expect(result.perFileStats.get('src/file.ts')).toEqual({
      added: 1,
      removed: 2,
      isBinary: false,
    })
  })

  test('parses multiple files', () => {
    const input = '10\t5\tsrc/a.ts\n3\t8\tsrc/b.ts'
    const result = parseGitNumstat(input)
    expect(result.stats).toEqual({ filesCount: 2, linesAdded: 13, linesRemoved: 13 })
  })

  test('marks binary files', () => {
    const input = '-\t-\timage.png'
    const result = parseGitNumstat(input)
    expect(result.perFileStats.get('image.png')?.isBinary).toBe(true)
  })
})

// ============================================================
// parseShortstat tests
// ============================================================

describe('parseShortstat', () => {
  test('parses full shortstat', () => {
    const result = parseShortstat('3 files changed, 45 insertions(+), 12 deletions(-)')
    expect(result).toEqual({ filesCount: 3, linesAdded: 45, linesRemoved: 12 })
  })

  test('parses additions only', () => {
    const result = parseShortstat('1 file changed, 10 insertions(+)')
    expect(result).toEqual({ filesCount: 1, linesAdded: 10, linesRemoved: 0 })
  })

  test('parses deletions only', () => {
    const result = parseShortstat('1 file changed, 5 deletions(-)')
    expect(result).toEqual({ filesCount: 1, linesAdded: 0, linesRemoved: 5 })
  })

  test('returns null for empty input', () => {
    expect(parseShortstat('')).toBeNull()
  })
})

// ============================================================
// parseGitDiff tests
// ============================================================

describe('parseGitDiff', () => {
  const singleFileDiff = `diff --git a/src/file.ts b/src/file.ts
index abc..def 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,4 @@
 line1
-line2
+line2 modified
+new line
 line3`

  test('parses hunks from a single file diff', () => {
    const result = parseGitDiff(singleFileDiff)
    expect(result.size).toBe(1)
    const hunks = result.get('src/file.ts')
    expect(hunks).toBeDefined()
    expect(hunks!.length).toBe(1)
    expect(hunks![0].oldStart).toBe(1)
    expect(hunks![0].oldLines).toBe(3)
    expect(hunks![0].newStart).toBe(1)
    expect(hunks![0].newLines).toBe(4)
    expect(hunks![0].lines).toContain('-line2')
    expect(hunks![0].lines).toContain('+line2 modified')
  })

  test('returns empty map for empty input', () => {
    expect(parseGitDiff('').size).toBe(0)
  })

  test('handles multiple files', () => {
    const multiFile = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-old b
+new b`
    const result = parseGitDiff(multiFile)
    expect(result.size).toBe(2)
    expect(result.has('a.ts')).toBe(true)
    expect(result.has('b.ts')).toBe(true)
  })
})
