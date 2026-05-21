import { describe, test, expect, beforeEach } from 'bun:test'
import type { Tool } from '../../../Tool.js'
import {
  buildToolIndex,
  searchTools,
  getToolIndex,
  clearToolIndexCache,
} from '../toolIndex.js'

// Mock isDeferred: everything NOT in CORE_TOOLS is deferred
const CORE_TOOLS = new Set([
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'Agent',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'TaskOutput',
  'TaskStop',
  'EnterPlanMode',
  'ExitPlanMode',
  'VerifyPlanExecution',
  'LSP',
  'Skill',
  'Sleep',
])

function isDeferred(tool: Tool): boolean {
  return !CORE_TOOLS.has(tool.name)
}

function makeTool(
  name: string,
  description: string,
  prompt: string,
  isMcp = false,
): Tool {
  return {
    name,
    description,
    prompt,
    inputSchema: { type: 'object', properties: {}, required: [] },
    isMcp,
    execute: async () => ({ content: '', success: true }),
    userFacingName: () => name,
  }
}

const mockTools: Tool[] = [
  // Core tools (not deferred)
  makeTool(
    'Bash',
    'Execute shell commands',
    'Run bash commands in the terminal',
  ),
  makeTool('Read', 'Read file contents', 'Read a file from disk'),
  makeTool('Write', 'Write to a file', 'Write content to a file'),
  makeTool('Edit', 'Edit file content', 'Make targeted edits to files'),
  makeTool(
    'Glob',
    'Find files by pattern',
    'Search for files matching a glob pattern',
  ),
  makeTool('Grep', 'Search file contents', 'Search for patterns in files'),
  makeTool('WebFetch', 'Fetch web content', 'Fetch content from a URL'),
  makeTool('WebSearch', 'Search the web', 'Perform web searches'),
  makeTool('Agent', 'Launch a sub-agent', 'Launch an AI agent to handle tasks'),
  makeTool('TaskCreate', 'Create a task', 'Create a new task for tracking'),
  makeTool('TaskUpdate', 'Update a task', 'Update task status or details'),
  makeTool('TaskList', 'List tasks', 'List all tasks'),
  makeTool('TaskGet', 'Get task details', 'Get details of a specific task'),
  makeTool('TaskOutput', 'Get task output', 'Get output from a task'),
  makeTool('TaskStop', 'Stop a task', 'Stop a running task'),
  makeTool(
    'EnterPlanMode',
    'Enter plan mode',
    'Enter planning mode for complex tasks',
  ),
  makeTool('ExitPlanMode', 'Exit plan mode', 'Exit planning mode'),
  makeTool(
    'VerifyPlanExecution',
    'Verify plan execution',
    'Verify that a plan was executed correctly',
  ),
  makeTool(
    'LSP',
    'Language server protocol',
    'Access language server features',
  ),
  makeTool('Skill', 'Invoke a skill', 'Execute a skill by name'),
  makeTool('Sleep', 'Sleep for duration', 'Pause execution for a time'),

  // Deferred tools (these should be indexed)
  makeTool(
    'CronCreate',
    'Create a scheduled cron job',
    'Creates cron jobs to run commands on a schedule',
  ),
  makeTool(
    'CronDelete',
    'Delete a cron job',
    'Deletes a previously created cron job by ID',
  ),
  makeTool('CronList', 'List all cron jobs', 'Lists all scheduled cron jobs'),
  makeTool(
    'PowerShell',
    'Run PowerShell commands',
    'Execute PowerShell scripts and commands',
  ),
  makeTool(
    'NotebookEdit',
    'Edit Jupyter notebooks',
    'Edit cells in Jupyter notebook files',
  ),
  makeTool('TeamCreate', 'Create a team', 'Create a team of agents'),
  makeTool('TeamDelete', 'Delete a team', 'Delete a team of agents'),
  makeTool(
    'SendMessage',
    'Send a message',
    'Send a message to another agent or user',
  ),
  makeTool('SendUserFile', 'Send a file to user', 'Send a file to the user'),
  makeTool(
    'MCP__test__tool1' as string,
    'MCP test tool',
    'An MCP server tool',
    true,
  ),
]

beforeEach(() => {
  clearToolIndexCache()
})

describe('buildToolIndex', () => {
  test('only indexes deferred tools', () => {
    const index = buildToolIndex(mockTools, isDeferred)
    // 10 deferred tools (CronCreate, CronDelete, CronList, PowerShell, NotebookEdit, TeamCreate, TeamDelete, SendMessage, SendUserFile, MCP tool)
    expect(index.length).toBe(10)
  })

  test('every indexed entry has required fields', () => {
    const index = buildToolIndex(mockTools, isDeferred)
    for (const entry of index) {
      expect(entry.name).not.toBe('')
      expect(entry.tokens.length).toBeGreaterThan(0)
      expect(entry.tfVector.size).toBeGreaterThan(0)
      expect(entry.isDeferred).toBe(true)
    }
  })

  test('MCP tools are marked as isMcp', () => {
    const index = buildToolIndex(mockTools, isDeferred)
    const mcpEntry = index.find(e => e.name === 'MCP__test__tool1')
    expect(mcpEntry).toBeDefined()
    expect(mcpEntry!.isMcp).toBe(true)
  })
})

describe('searchTools', () => {
  test('returns empty results for no matches', () => {
    const index = buildToolIndex(mockTools, isDeferred)
    const results = searchTools('xyznonexistent123', index)
    expect(results.length).toBe(0)
  })

  test('finds tools by name', () => {
    const index = buildToolIndex(mockTools, isDeferred)
    const results = searchTools('cron create', index)
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(r => r.name === 'CronCreate')).toBe(true)
  })

  test('finds tools by description', () => {
    const index = buildToolIndex(mockTools, isDeferred)
    const results = searchTools('schedule commands', index)
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(r => r.name === 'CronCreate')).toBe(true)
  })

  test('respects limit', () => {
    const index = buildToolIndex(mockTools, isDeferred)
    const results = searchTools('tool', index, 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  test('handles empty query', () => {
    const index = buildToolIndex(mockTools, isDeferred)
    const results = searchTools('', index)
    expect(results.length).toBe(0)
  })

  test('handles empty index', () => {
    const results = searchTools('cron', [])
    expect(results.length).toBe(0)
  })
})

describe('getToolIndex', () => {
  test('caches the index', () => {
    const index1 = getToolIndex(mockTools, isDeferred)
    const index2 = getToolIndex(mockTools, isDeferred)
    expect(index1).toBe(index2) // same reference = cached
  })

  test('rebuilds when tools change', () => {
    const index1 = getToolIndex(mockTools, isDeferred)
    const newTools = [
      ...mockTools,
      makeTool('ExtraTool', 'Extra', 'Extra prompt'),
    ]
    const index2 = getToolIndex(newTools, isDeferred)
    expect(index1).not.toBe(index2)
    expect(index2.length).toBe(index1.length + 1)
  })
})
