import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getSystemContext } from '../context.js'
import { addMemory, setMemoryDir } from '../services/memory/memoryStore.js'
import {
  initSession,
  endSession,
  persistSessionMemory,
  setSessionMemoryDir,
  SESSION_MEMORY_COMPACTION_MARKER,
} from '../services/memory/sessionMemory.js'
import { getCwd, setCwd } from '../bootstrap/state.js'
import {
  clearConversationBuffers,
  createConversationBuffers,
  requestForcedCompaction,
} from '../services/messages/apiProjection.js'
import {
  createTeam,
  addTeamMember,
  resetTeamManager,
  setTeamsBaseDir,
} from '../agents/teamManager.js'
import {
  setTeamMemoryDir,
  writeTeamMemory,
} from '../services/memory/teamMemorySync.js'

let tempDir: string
const originalCwd = getCwd()

describe('getSystemContext', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mini-v8-context-'))
    writeFileSync(
      join(tempDir, 'CLAUDE.md'),
      '# Temp instructions\nalpha',
      'utf-8',
    )
    setSessionMemoryDir(tempDir)
    setMemoryDir(tempDir)
    setTeamMemoryDir(join(tempDir, 'team-memory'))
    setTeamsBaseDir(tempDir)
    setCwd(tempDir)
    initSession()
  })

  afterEach(() => {
    endSession()
    resetTeamManager()
    setTeamMemoryDir(null)
    setTeamsBaseDir(null)
    setCwd(originalCwd)
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {}
  })

  test('returns a non-empty string', async () => {
    const ctx = await getSystemContext()
    expect(typeof ctx).toBe('string')
    expect(ctx.length).toBeGreaterThan(0)
  })

  test('contains current date', async () => {
    const ctx = await getSystemContext()
    expect(ctx).toContain('Current date:')
  })

  test('contains working directory', async () => {
    const ctx = await getSystemContext()
    expect(ctx).toContain('Working directory:')
  })

  test('does not throw', async () => {
    let threw = false
    try {
      await getSystemContext()
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })

  test('injects session memory into a fresh conversation slice', async () => {
    const before = await getSystemContext(undefined, {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeClaudeMd: false,
      includeSkills: false,
      includeMemories: false,
      includeAgents: false,
      includeTeams: false,
      sessionMemoryMode: 'auto',
      conversationMessages: [
        { role: 'user', content: 'Continue after clearing the REPL' },
      ],
    })

    expect(before).toBe('')

    persistSessionMemory([
      {
        id: 'note-1',
        category: 'decision',
        content: 'Carry forward the auth migration plan',
        timestamp: new Date().toISOString(),
      },
    ])

    const ctx = await getSystemContext(undefined, {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeClaudeMd: false,
      includeSkills: false,
      includeMemories: false,
      includeAgents: false,
      includeTeams: false,
      sessionMemoryMode: 'auto',
      conversationMessages: [
        { role: 'user', content: 'Continue after clearing the REPL' },
      ],
    })

    expect(ctx).toContain('Session Memory (auto-extracted)')
    expect(ctx).toContain('Carry forward the auth migration plan')
  })

  test('skips session memory once compact summary already consumed it', async () => {
    persistSessionMemory([
      {
        id: 'note-1',
        category: 'decision',
        content: 'Carry forward the auth migration plan',
        timestamp: new Date().toISOString(),
      },
    ])

    const ctx = await getSystemContext(undefined, {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeClaudeMd: false,
      includeSkills: false,
      includeMemories: false,
      includeAgents: false,
      includeTeams: false,
      sessionMemoryMode: 'auto',
      conversationMessages: [
        { role: 'user', content: 'Continue after compact' },
        {
          role: 'assistant',
          content:
            SESSION_MEMORY_COMPACTION_MARKER +
            '\n## Session Memory (auto-extracted)\n- Carry forward the auth migration plan',
        },
      ],
    })

    expect(ctx).toBe('')
  })

  test('uses query-aware memory retrieval for the prompt', async () => {
    addMemory('Fix auth retry flow in src/auth.ts', ['auth'], 'bug')
    addMemory('Landing page color review notes', ['design'], 'note')

    const ctx = await getSystemContext(undefined, {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeClaudeMd: false,
      includeSkills: false,
      includeAgents: false,
      includeTeams: false,
      includeMemoriesOnlyWhenRelevant: false,
      maxContextTokens: 300,
      conversationMessages: [
        { role: 'user', content: 'continue the auth retry fix' },
      ],
    })

    expect(ctx).toContain('Fix auth retry flow')
    expect(ctx).not.toContain('Landing page color review notes')
  })

  test('drops optional context blocks when the prompt budget is tight', async () => {
    addMemory(
      'Fix auth retry flow in src/auth.ts and keep the migration rationale handy.',
      ['auth'],
      'bug',
    )

    const ctx = await getSystemContext(undefined, {
      maxContextTokens: 30,
      conversationMessages: [
        { role: 'user', content: 'continue the auth retry fix' },
      ],
    })

    expect(ctx).toContain('Current date:')
    expect(ctx).toContain('Working directory:')
    expect(ctx).not.toContain('User Memories')
  })

  test('clear invalidates cached CLAUDE.md context blocks', async () => {
    const config = {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeSkills: false,
      includeMemories: false,
      includeAgents: false,
      includeTeams: false,
      maxContextTokens: 400,
    }
    const conversation = createConversationBuffers([
      { role: 'user', content: 'show repo instructions' },
    ])

    const before = await getSystemContext(undefined, config)
    expect(before).toContain('alpha')

    writeFileSync(
      join(tempDir, 'CLAUDE.md'),
      '# Temp instructions\nbeta',
      'utf-8',
    )
    clearConversationBuffers(conversation)

    const after = await getSystemContext(undefined, config)
    expect(after).toContain('beta')
    expect(after).not.toContain('alpha')
  })

  test('forced compaction invalidates cached CLAUDE.md context blocks', async () => {
    const config = {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeSkills: false,
      includeMemories: false,
      includeAgents: false,
      includeTeams: false,
      maxContextTokens: 400,
    }
    const conversation = createConversationBuffers([
      { role: 'user', content: 'prepare a compacted turn' },
    ])

    const before = await getSystemContext(undefined, config)
    expect(before).toContain('alpha')

    writeFileSync(
      join(tempDir, 'CLAUDE.md'),
      '# Temp instructions\ngamma',
      'utf-8',
    )
    requestForcedCompaction(conversation)

    const after = await getSystemContext(undefined, config)
    expect(after).toContain('gamma')
    expect(after).not.toContain('alpha')
  })

  test('uses query-aware team retrieval for the prompt', async () => {
    createTeam('frontend-swarm', 'Handles landing page and design polish')
    addTeamMember('frontend-swarm', 'designer', 'design-reviewer')
    createTeam('infra-squad', 'Handles CI, build, and deployment fixes')
    addTeamMember('infra-squad', 'ops', 'deploy-worker')

    const ctx = await getSystemContext(undefined, {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeClaudeMd: false,
      includeSkills: false,
      includeMemories: false,
      includeAgents: false,
      includeTeamsOnlyWhenRelevant: true,
      maxContextTokens: 500,
      conversationMessages: [
        { role: 'user', content: 'ask the frontend team to review the design' },
      ],
    })

    expect(ctx).toContain('frontend-swarm')
    expect(ctx).toContain('designer')
    expect(ctx).not.toContain('infra-squad')
  })

  test('injects query-aware team memory when enabled and relevant', async () => {
    writeTeamMemory(
      'frontend-swarm',
      'Landing page design decisions: keep warm orange accents and avoid generic hero layouts.',
    )
    writeTeamMemory(
      'infra-squad',
      'CI stabilization notes: retry flaky build steps and keep cache keys stable.',
    )

    const ctx = await getSystemContext(undefined, {
      includeDate: false,
      includeWorkingDirectory: false,
      includeGit: false,
      includeClaudeMd: false,
      includeSkills: false,
      includeMemories: false,
      includeAgents: false,
      includeTeams: false,
      includeTeamMemory: true,
      includeTeamsOnlyWhenRelevant: true,
      maxContextTokens: 500,
      conversationMessages: [
        {
          role: 'user',
          content: 'continue the frontend design review for the landing page',
        },
      ],
    })

    expect(ctx).toContain('## Team Memory')
    expect(ctx).toContain('frontend-swarm')
    expect(ctx).toContain('Landing page design decisions')
    expect(ctx).not.toContain('infra-squad')
  })

  test('drops team memory when the overall prompt budget is tight', async () => {
    writeTeamMemory(
      'frontend-swarm',
      'Landing page design decisions: keep warm orange accents and avoid generic hero layouts.',
    )

    const ctx = await getSystemContext(undefined, {
      includeMemories: false,
      includeAgents: false,
      includeTeamMemory: true,
      includeTeams: false,
      includeSkillsOnlyWhenRelevant: false,
      includeTeamsOnlyWhenRelevant: false,
      maxContextTokens: 30,
      conversationMessages: [
        { role: 'user', content: 'review frontend team memory' },
      ],
    })

    expect(ctx).toContain('Current date:')
    expect(ctx).toContain('Working directory:')
    expect(ctx).not.toContain('## Team Memory')
  })
})
