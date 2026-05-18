import { describe, expect, test } from 'bun:test'
import { getTools, getToolsMap } from '../tools/tools.js'

describe('getTools', () => {
  test('returns 31 tools', () => {
    const tools = getTools()
    expect(tools.length).toBe(31)
  })

  test('all tools have required name', () => {
    const tools = getTools()
    for (const t of tools) {
      expect(typeof t.name).toBe('string')
      expect(t.name.length).toBeGreaterThan(0)
    }
  })

  test('all tools have required description', () => {
    const tools = getTools()
    for (const t of tools) {
      expect(typeof t.description).toBe('string')
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  test('all tools have valid inputSchema', () => {
    const tools = getTools()
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object')
    }
  })

  test('includes core file tools', () => {
    const toolNames = getTools().map(t => t.name)
    expect(toolNames).toContain('Bash')
    expect(toolNames).toContain('Read')
    expect(toolNames).toContain('Write')
    expect(toolNames).toContain('Edit')
    expect(toolNames).toContain('Grep')
    expect(toolNames).toContain('Glob')
  })

  test('includes web tools', () => {
    const toolNames = getTools().map(t => t.name)
    expect(toolNames).toContain('WebFetch')
    expect(toolNames).toContain('WebSearch')
  })

  test('includes task tools', () => {
    const toolNames = getTools().map(t => t.name)
    expect(toolNames).toContain('TaskCreate')
    expect(toolNames).toContain('TaskUpdate')
    expect(toolNames).toContain('TaskList')
    expect(toolNames).toContain('TaskGet')
    expect(toolNames).toContain('TaskOutput')
    expect(toolNames).toContain('TaskStop')
  })

  test('includes apply patch and skill tools', () => {
    const toolNames = getTools().map(t => t.name)
    expect(toolNames).toContain('ApplyPatch')
    expect(toolNames).toContain('Skill')
  })

  test('no duplicate tool names', () => {
    const tools = getTools()
    const names = tools.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('getToolsMap', () => {
  test('returns a Map', () => {
    expect(getToolsMap()).toBeInstanceOf(Map)
  })

  test('has same count as tool list', () => {
    expect(getToolsMap().size).toBe(getTools().length)
  })

  test('maps tool names to tool objects', () => {
    const map = getToolsMap()
    expect(map.get('Bash')).toBeDefined()
    expect(map.get('Read')).toBeDefined()
    expect(map.get('TaskCreate')).toBeDefined()
    expect(map.get('ApplyPatch')).toBeDefined()
  })
})
