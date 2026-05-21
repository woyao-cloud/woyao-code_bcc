import { describe, test, expect } from 'bun:test'

import {
  handleSkillSearchCommand,
  isSkillSearchEnabled,
  searchLocalSkills,
} from '../../commands/skillCommands.js'

describe('handleSkillSearchCommand', () => {
  test('start enables skill search', () => {
    const result = handleSkillSearchCommand('start')
    expect(result).toContain('enabled')
    expect(isSkillSearchEnabled()).toBe(true)
  })

  test('stop disables skill search', () => {
    handleSkillSearchCommand('start') // ensure it's on first
    const result = handleSkillSearchCommand('stop')
    expect(result).toContain('disabled')
    expect(isSkillSearchEnabled()).toBe(false)
  })

  test('status shows current state', () => {
    const result = handleSkillSearchCommand('status')
    expect(result).toContain('Skill Search')
  })

  test('help shows commands', () => {
    const result = handleSkillSearchCommand('help')
    expect(result).toContain('start')
    expect(result).toContain('stop')
    expect(result).toContain('status')
  })

  test('empty args shows help', () => {
    const result = handleSkillSearchCommand('')
    expect(result).toContain('start')
  })

  test('unknown command returns error', () => {
    const result = handleSkillSearchCommand('unknown')
    expect(result).toContain('Unknown')
  })
})

describe('searchLocalSkills', () => {
  const testSkills = [
    {
      name: 'python-testing',
      path: '/tmp/skills/python-testing/SKILL.md',
      content: 'Guidelines for Python unit testing with pytest and coverage.',
      source: 'user' as const,
    },
    {
      name: 'react-patterns',
      path: '/tmp/skills/react-patterns/SKILL.md',
      content: 'React component patterns and hooks best practices.',
      source: 'user' as const,
    },
    {
      name: 'deploy-guide',
      path: '/tmp/skills/deploy-guide/SKILL.md',
      content: 'Deployment guide for Docker and Kubernetes.',
      source: 'user' as const,
    },
  ]

  test('returns matching skills by name', () => {
    const results = searchLocalSkills(testSkills, 'python')
    expect(results.length).toBe(1)
    expect(results[0]?.name).toBe('python-testing')
  })

  test('returns matching skills by content', () => {
    const results = searchLocalSkills(testSkills, 'docker')
    expect(results.length).toBe(1)
    expect(results[0]?.name).toBe('deploy-guide')
  })

  test('returns empty for no matches', () => {
    const results = searchLocalSkills(testSkills, 'zzzznonexistent')
    expect(results.length).toBe(0)
  })

  test('returns empty for empty query', () => {
    const results = searchLocalSkills(testSkills, '')
    expect(results.length).toBe(0)
  })

  test('ranks by relevance (name match scores higher)', () => {
    const skillsWithNameMatch = [
      ...testSkills,
      {
        name: 'docker-helper',
        path: '/tmp/skills/docker-helper/SKILL.md',
        content: 'Helper for Docker operations',
        source: 'user' as const,
      },
    ]
    const results = searchLocalSkills(skillsWithNameMatch, 'docker')
    expect(results.length).toBeGreaterThanOrEqual(2)
    // docker-helper should come first (name match = higher score)
    expect(results[0]?.name).toBe('docker-helper')
  })
})
