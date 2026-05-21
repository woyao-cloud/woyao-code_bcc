import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  getAgentMemoryDir,
  ensureAgentMemoryDir,
  writeMemoryTopic,
  readMemoryIndex,
  appendToMemoryIndex,
  loadAgentMemoryPrompt,
  listMemoryTopics,
  deleteMemoryTopic,
} from '../agents/agentMemory.js'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mini-v8-agent-memory-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('getAgentMemoryDir', () => {
  test('returns user scope path', () => {
    const dir = getAgentMemoryDir('Explore', 'user', '/home/user/proj')
    expect(dir).toContain('.claude')
    expect(dir).toContain('agent-memory')
    expect(dir).toContain('Explore')
    expect(dir).not.toContain('agent-memory-local')
  })

  test('returns project scope path under cwd/.claude', () => {
    const dir = getAgentMemoryDir('Plan', 'project', '/home/user/proj')
    const expected = join('/home/user/proj', '.claude', 'agent-memory', 'Plan')
    expect(dir).toBe(expected)
  })

  test('returns local scope path under cwd/.claude', () => {
    const dir = getAgentMemoryDir('Explore', 'local', '/home/user/proj')
    const expected = join(
      '/home/user/proj',
      '.claude',
      'agent-memory-local',
      'Explore',
    )
    expect(dir).toBe(expected)
  })

  test('falls back to process.cwd() when cwd not provided', () => {
    const dir = getAgentMemoryDir('Test', 'project')
    expect(dir).toContain(join('.claude', 'agent-memory', 'Test'))
  })
})

describe('ensureAgentMemoryDir', () => {
  test('creates directory and MEMORY.md', () => {
    const dir = ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    expect(existsSync(dir)).toBe(true)
    expect(existsSync(join(dir, 'MEMORY.md'))).toBe(true)
  })

  test('returns existing directory without error', () => {
    const dir1 = ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    const dir2 = ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    expect(dir1).toBe(dir2)
    expect(existsSync(dir1)).toBe(true)
  })

  test('creates MEMORY.md with initial content', () => {
    ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    const content = readFileSync(
      join(tempDir, '.claude', 'agent-memory-local', 'MyAgent', 'MEMORY.md'),
      'utf-8',
    )
    expect(content).toContain('# Agent Memory Index')
    expect(content).toContain('Agent: MyAgent')
    expect(content).toContain('Scope: local')
    expect(content).toContain('No memories yet.')
  })
})

describe('writeMemoryTopic', () => {
  test('writes topic file to memory directory', () => {
    const filePath = writeMemoryTopic(
      'MyAgent',
      'local',
      'user_role.md',
      'Test content',
      tempDir,
    )
    expect(existsSync(filePath)).toBe(true)
    const content = readFileSync(filePath, 'utf-8')
    expect(content).toBe('Test content')
  })

  test('auto-appends .md extension', () => {
    const filePath = writeMemoryTopic(
      'MyAgent',
      'local',
      'user_role',
      'Content',
      tempDir,
    )
    expect(filePath.endsWith('.md')).toBe(true)
  })

  test('creates parent directory automatically', () => {
    const filePath = writeMemoryTopic(
      'NewAgent',
      'project',
      'note.md',
      'Hello',
      tempDir,
    )
    expect(existsSync(filePath)).toBe(true)
  })
})

describe('readMemoryIndex', () => {
  test('returns empty string when no index exists', () => {
    const content = readMemoryIndex('NoAgent', 'local', tempDir)
    expect(content).toBe('')
  })

  test('returns index content when exists', () => {
    ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    const content = readMemoryIndex('MyAgent', 'local', tempDir)
    expect(content).toContain('# Agent Memory Index')
    expect(content).toContain('MyAgent')
  })
})

describe('appendToMemoryIndex', () => {
  test('appends entry to empty index', () => {
    ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    appendToMemoryIndex(
      'MyAgent',
      'local',
      '- [User Info](user_role.md) — role details',
      tempDir,
    )
    const content = readMemoryIndex('MyAgent', 'local', tempDir)
    expect(content).toContain('[User Info](user_role.md)')
  })

  test('replaces No memories yet placeholder', () => {
    ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    appendToMemoryIndex(
      'MyAgent',
      'local',
      '- [Prefs](prefs.md) — preferences',
      tempDir,
    )
    const content = readMemoryIndex('MyAgent', 'local', tempDir)
    expect(content).not.toContain('No memories yet.')
    expect(content).toContain('[Prefs](prefs.md)')
  })

  test('appends multiple entries', () => {
    ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    appendToMemoryIndex('MyAgent', 'local', '- [First](first.md)', tempDir)
    appendToMemoryIndex('MyAgent', 'local', '- [Second](second.md)', tempDir)
    const content = readMemoryIndex('MyAgent', 'local', tempDir)
    expect(content.split('- [First]').length).toBe(2)
    expect(content.split('- [Second]').length).toBe(2)
  })
})

describe('loadAgentMemoryPrompt', () => {
  test('returns type definitions when no memory exists', () => {
    const prompt = loadAgentMemoryPrompt('MyAgent', 'local', tempDir)
    expect(prompt).toContain('Memory System')
    expect(prompt).toContain('Types of memory')
    expect(prompt).not.toContain('Current Memory Index')
  })

  test('includes index content when memory exists', () => {
    ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    appendToMemoryIndex('MyAgent', 'local', '- [Test](test.md)', tempDir)
    const prompt = loadAgentMemoryPrompt('MyAgent', 'local', tempDir)
    expect(prompt).toContain('Current Memory Index')
    expect(prompt).toContain('[Test](test.md)')
  })

  test('includes topic content when topic files exist', () => {
    ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    writeMemoryTopic(
      'MyAgent',
      'local',
      'user_role.md',
      '## User Role\nThe user is a developer.',
      tempDir,
    )
    appendToMemoryIndex(
      'MyAgent',
      'local',
      '- [User Role](user_role.md) — role',
      tempDir,
    )
    const prompt = loadAgentMemoryPrompt('MyAgent', 'local', tempDir)
    expect(prompt).toContain('Memory Topic Contents')
    expect(prompt).toContain('User Role')
  })
})

describe('listMemoryTopics', () => {
  test('returns empty for non-existent directory', () => {
    const topics = listMemoryTopics('NoAgent', 'local', tempDir)
    expect(topics).toEqual([])
  })

  test('returns topic files excluding MEMORY.md', () => {
    ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    writeMemoryTopic('MyAgent', 'local', 'topic1.md', 'content1', tempDir)
    writeMemoryTopic('MyAgent', 'local', 'topic2.md', 'content2', tempDir)
    const topics = listMemoryTopics('MyAgent', 'local', tempDir)
    expect(topics.length).toBe(2)
    expect(topics).toContain('topic1.md')
    expect(topics).toContain('topic2.md')
    expect(topics).not.toContain('MEMORY.md')
  })
})

describe('deleteMemoryTopic', () => {
  test('deletes existing topic file', () => {
    ensureAgentMemoryDir('MyAgent', 'local', tempDir)
    writeMemoryTopic('MyAgent', 'local', 'todelete.md', 'content', tempDir)
    expect(listMemoryTopics('MyAgent', 'local', tempDir).length).toBe(1)
    const result = deleteMemoryTopic('MyAgent', 'local', 'todelete.md', tempDir)
    expect(result).toBe(true)
    expect(listMemoryTopics('MyAgent', 'local', tempDir).length).toBe(0)
  })

  test('returns false for non-existent file', () => {
    const result = deleteMemoryTopic(
      'MyAgent',
      'local',
      'nonexistent.md',
      tempDir,
    )
    expect(result).toBe(false)
  })
})
