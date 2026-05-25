import { describe, expect, test } from 'bun:test'
import {
  createWorktreeIsolation,
  getWorktreeConfig,
} from '../agents/forkSubagent.js'

describe('forkSubagent', () => {
  test('createWorktreeIsolation returns fork and worktree configs', () => {
    const { forkConfig, worktreeConfig } = createWorktreeIsolation()
    expect(forkConfig.enabled).toBe(true)
    expect(forkConfig.isolation).toBe('worktree')
    expect(forkConfig.maxTurns).toBe(25)
    expect(worktreeConfig.autoRemove).toBe(true)
    expect(worktreeConfig.discardChanges).toBe(true)
    expect(worktreeConfig.branch).toMatch(/^fork-/)
  })

  test('createWorktreeIsolation with custom branch name', () => {
    const { worktreeConfig } = createWorktreeIsolation('my-feature-branch')
    expect(worktreeConfig.branch).toBe('my-feature-branch')
  })

  test('createWorktreeIsolation with autoRemove disabled', () => {
    const { worktreeConfig } = createWorktreeIsolation('test-branch', false)
    expect(worktreeConfig.autoRemove).toBe(false)
  })

  test('getWorktreeConfig returns undefined when isolation is not worktree', () => {
    const config = getWorktreeConfig(
      { enabled: true, isolation: 'none', maxTurns: 25 },
      undefined,
    )
    expect(config).toBeUndefined()
  })

  test('getWorktreeConfig returns config when isolation is worktree', () => {
    const wc = { branch: 'test', autoRemove: true, discardChanges: false }
    const config = getWorktreeConfig(
      { enabled: true, isolation: 'worktree' },
      wc,
    )
    expect(config).toBe(wc)
  })
})
