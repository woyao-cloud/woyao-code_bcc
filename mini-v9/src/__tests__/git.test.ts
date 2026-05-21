import { describe, expect, test } from 'bun:test'
import { normalizeRemoteUrl, hashRemoteUrl, GitStatus } from '../utils/git.js'

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
