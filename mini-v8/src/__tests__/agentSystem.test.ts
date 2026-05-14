// ============================================================
// Agent System Tests for mini-v8
// ============================================================

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  resetAgentRegistry,
  initAgentRegistry,
  getAllAgents,
  getAgent,
  searchAgents,
  registerAgent,
  unregisterAgent,
  getAgentTypeNames,
} from '../agents/agentRegistry.js'
import {
  GENERAL_PURPOSE_AGENT,
  EXPLORE_AGENT,
  PLAN_AGENT,
  COORDINATOR_AGENT,
  WORKER_AGENT,
  VERIFICATION_AGENT,
  getBuiltInAgents,
} from '../agents/builtInAgents.js'
import type { AgentDefinition } from '../agents/agentTypes.js'
import {
  createTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  getTeam,
  getAllTeams,
  getTeamMembers,
  teamExists,
  updateMemberStatus,
  resetTeamManager,
  setTeamsBaseDir,
} from '../agents/teamManager.js'

// ============================================================
// Built-in Agents Tests
// ============================================================

describe('builtInAgents', () => {
  test('getBuiltInAgents returns 6 agents', () => {
    const agents = getBuiltInAgents()
    expect(agents.length).toBe(6)
  })

  test('all built-in agents have required fields', () => {
    const agents = getBuiltInAgents()
    for (const agent of agents) {
      expect(typeof agent.agentType).toBe('string')
      expect(agent.agentType.length).toBeGreaterThan(0)
      expect(typeof agent.whenToUse).toBe('string')
      expect(agent.whenToUse.length).toBeGreaterThan(0)
      expect(agent.source).toBe('built-in')
      expect(typeof agent.getSystemPrompt).toBe('function')
      expect(agent.getSystemPrompt().length).toBeGreaterThan(50)
    }
  })

  test('Explore agent is read-only (has disallowed tools)', () => {
    expect(EXPLORE_AGENT.disallowedTools).toBeDefined()
    expect(EXPLORE_AGENT.disallowedTools!.length).toBeGreaterThan(0)
    expect(EXPLORE_AGENT.disallowedTools).toContain('Write')
    expect(EXPLORE_AGENT.disallowedTools).toContain('Edit')
  })

  test('Plan agent is read-only', () => {
    expect(PLAN_AGENT.disallowedTools).toBeDefined()
    expect(PLAN_AGENT.disallowedTools).toContain('Write')
  })

  test('General-purpose agent has all tools', () => {
    expect(GENERAL_PURPOSE_AGENT.tools).toEqual(['*'])
  })

  test('Coordinator agent has all tools', () => {
    expect(COORDINATOR_AGENT.tools).toEqual(['*'])
  })

  test('Worker agent has all tools', () => {
    expect(WORKER_AGENT.tools).toEqual(['*'])
  })

  test('each agent type is unique', () => {
    const types = getBuiltInAgents().map(a => a.agentType)
    expect(new Set(types).size).toBe(types.length)
  })

  test('system prompts are non-empty strings', () => {
    const agents = getBuiltInAgents()
    for (const agent of agents) {
      const prompt = agent.getSystemPrompt()
      expect(typeof prompt).toBe('string')
      expect(prompt.trim().length).toBeGreaterThan(0)
    }
  })
})

// ============================================================
// Agent Registry Tests
// ============================================================

describe('agentRegistry', () => {
  beforeEach(() => {
    resetAgentRegistry()
  })

  test('initAgentRegistry loads built-in agents', () => {
    const testDir = process.env.TEMP || process.env.TMPDIR || '/tmp'
    initAgentRegistry(testDir)
    const agents = getAllAgents()
    expect(agents.length).toBeGreaterThanOrEqual(6)
  })

  test('registerAgent adds a new agent', () => {
    const customAgent: AgentDefinition = {
      agentType: 'my-custom',
      whenToUse: 'A custom test agent',
      description: 'Test agent',
      source: 'user',
      getSystemPrompt: () => 'You are a custom test agent.',
    }
    registerAgent(customAgent)
    const found = getAgent('my-custom')
    expect(found).toBeDefined()
    expect(found!.agentType).toBe('my-custom')
  })

  test('unregisterAgent removes an agent', () => {
    const customAgent: AgentDefinition = {
      agentType: 'to-remove',
      whenToUse: 'Gets removed',
      source: 'user',
      getSystemPrompt: () => 'test',
    }
    registerAgent(customAgent)
    expect(getAgent('to-remove')).toBeDefined()
    unregisterAgent('to-remove')
    expect(getAgent('to-remove')).toBeUndefined()
  })

  test('searchAgents finds by name', () => {
    const testDir = process.env.TEMP || process.env.TMPDIR || '/tmp'
    initAgentRegistry(testDir)
    const results = searchAgents('Explore')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(a => a.agentType === 'Explore')).toBe(true)
  })

  test('searchAgents finds by description', () => {
    const testDir = process.env.TEMP || process.env.TMPDIR || '/tmp'
    initAgentRegistry(testDir)
    const results = searchAgents('research')
    expect(results.length).toBeGreaterThan(0)
  })

  test('getAgentTypeNames returns all type names', () => {
    const testDir = process.env.TEMP || process.env.TMPDIR || '/tmp'
    initAgentRegistry(testDir)
    const names = getAgentTypeNames()
    expect(names).toContain('Explore')
    expect(names).toContain('general-purpose')
    expect(names).toContain('worker')
  })

  test('user agent overrides built-in with same type', () => {
    const testDir = process.env.TEMP || process.env.TMPDIR || '/tmp'
    initAgentRegistry(testDir)
    const original = getAgent('Explore')
    expect(original).toBeDefined()

    // Register user agent with same type
    const userExplore: AgentDefinition = {
      agentType: 'Explore',
      whenToUse: 'User override',
      source: 'user',
      getSystemPrompt: () => 'user override',
    }
    registerAgent(userExplore)
    const updated = getAgent('Explore')
    // User source should take priority
    expect(updated!.source).toBe('user')
    expect(updated!.getSystemPrompt()).toBe('user override')
  })
})

// ============================================================
// Team Manager Tests
// ============================================================

describe('teamManager', () => {
  let tempDir: string

  beforeEach(() => {
    resetTeamManager()
    tempDir = mkdtempSync(join(tmpdir(), 'mini-v8-team-'))
    setTeamsBaseDir(tempDir)
  })

  afterEach(() => {
    setTeamsBaseDir(null)
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true })
      } catch {}
    }
  })

  test('createTeam creates a new team with lead', () => {
    const { team, leadMemberId } = createTeam('test-team', 'Test team')
    expect(team.name).toBe('test-team')
    expect(team.description).toBe('Test team')
    expect(team.members.length).toBe(1)
    expect(team.members[0]!.role).toBe('lead')
    expect(team.members[0]!.isActive).toBe(true)
    expect(typeof leadMemberId).toBe('string')
    expect(leadMemberId.length).toBeGreaterThan(0)
  })

  test('createTeam generates unique name on conflict', () => {
    const { team: team1 } = createTeam('duplicate')
    const { team: team2 } = createTeam('duplicate')
    expect(team1.name).not.toBe(team2.name)
  })

  test('getTeam returns team definition', () => {
    createTeam('my-team')
    const team = getTeam('my-team')
    expect(team).toBeDefined()
    expect(team!.name).toBe('my-team')
  })

  test('getTeam returns undefined for non-existent team', () => {
    const team = getTeam('non-existent')
    expect(team).toBeUndefined()
  })

  test('teamExists returns correct status', () => {
    expect(teamExists('ghost')).toBe(false)
    createTeam('ghost')
    expect(teamExists('ghost')).toBe(true)
  })

  test('addTeamMember adds a worker to team', () => {
    createTeam('dev-team')
    const member = addTeamMember(
      'dev-team',
      'coder',
      'general-purpose',
      'worker',
    )
    expect(member).toBeDefined()
    expect(member!.name).toBe('coder')
    expect(member!.role).toBe('worker')
  })

  test('addTeamMember returns null for non-existent team', () => {
    const member = addTeamMember('ghost-team', 'coder', 'general-purpose')
    expect(member).toBeNull()
  })

  test('removeTeamMember removes a member', () => {
    createTeam('dev-team')
    const member = addTeamMember(
      'dev-team',
      'coder',
      'general-purpose',
      'worker',
    )
    expect(member).toBeDefined()
    const result = removeTeamMember('dev-team', member!.agentId)
    expect(result).toBe(true)
    expect(getTeamMembers('dev-team').length).toBe(1) // Only lead remains
  })

  test('updateMemberStatus toggles active flag', () => {
    const { team, leadMemberId } = createTeam('status-team')
    const result = updateMemberStatus('status-team', leadMemberId, false)
    expect(result).toBe(true)
    const updated = getTeam('status-team')
    expect(updated!.members[0]!.isActive).toBe(false)
  })

  test('deleteTeam succeeds for team with no workers', () => {
    createTeam('solo-team')
    const result = deleteTeam('solo-team')
    expect(result.success).toBe(true)
    expect(getTeam('solo-team')).toBeUndefined()
  })

  test('deleteTeam fails when active workers present', () => {
    createTeam('busy-team')
    addTeamMember('busy-team', 'worker1', 'general-purpose', 'worker')
    const result = deleteTeam('busy-team')
    expect(result.success).toBe(false)
    expect(result.message).toContain('active member')
  })

  test('deleteTeam succeeds after deactivating workers', () => {
    createTeam('deact-team')
    const member = addTeamMember(
      'deact-team',
      'worker1',
      'general-purpose',
      'worker',
    )
    expect(member).toBeDefined()
    updateMemberStatus('deact-team', member!.agentId, false)
    const result = deleteTeam('deact-team')
    expect(result.success).toBe(true)
  })

  test('getAllTeams returns all active teams', () => {
    expect(getAllTeams().length).toBe(0)
    createTeam('team-a')
    createTeam('team-b')
    expect(getAllTeams().length).toBe(2)
    expect(getAllTeams().map(t => t.name)).toContain('team-a')
    expect(getAllTeams().map(t => t.name)).toContain('team-b')
  })

  test('getTeamMembers returns all members', () => {
    createTeam('member-team')
    addTeamMember('member-team', 'alice', 'general-purpose', 'worker')
    addTeamMember('member-team', 'bob', 'general-purpose', 'worker')
    const members = getTeamMembers('member-team')
    expect(members.length).toBe(3) // lead + 2 workers
    expect(members.map(m => m.name)).toContain('alice')
    expect(members.map(m => m.name)).toContain('bob')
  })
})

// ============================================================
// Agent Definition Validation Tests
// ============================================================

describe('agentDefinition', () => {
  test('custom agent definition has correct shape', () => {
    const def: AgentDefinition = {
      agentType: 'code-reviewer',
      whenToUse: 'Reviews code for bugs and style issues',
      description: 'Code review specialist',
      tools: ['Read', 'Grep', 'Glob'],
      disallowedTools: ['Write', 'Edit'],
      skills: [],
      model: 'sonnet',
      maxTurns: 10,
      source: 'user',
      baseDir: 'user',
      color: 'blue',
      getSystemPrompt: () => 'You are a code reviewer.',
    }

    expect(def.agentType).toBe('code-reviewer')
    expect(def.tools).toContain('Read')
    expect(def.disallowedTools).toContain('Write')
    expect(def.maxTurns).toBe(10)
    expect(def.getSystemPrompt()).toBe('You are a code reviewer.')
  })
})
