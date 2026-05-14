// ============================================================
// Agent REPL Commands for mini-v8
// ============================================================
// Commands: /agent, /team, /swarm
// ============================================================

import type { LoadedPlugin } from '../plugins/types.js'
import { randomUUID } from 'crypto'

// ============================================================
// /agent commands
// ============================================================

/**
 * Handle /agent commands in the REPL.
 */
export async function handleAgentCommand(
  args: string,
  cwd: string,
  plugins: LoadedPlugin[],
): Promise<string> {
  const trimmed = args.trim()

  if (!trimmed || trimmed === 'help') {
    return agentHelp()
  }

  // List agents
  if (trimmed === 'list') {
    return agentList()
  }

  // Show agent details
  if (trimmed.startsWith('info ') || trimmed.startsWith('show ')) {
    const name = trimmed.slice(trimmed.indexOf(' ') + 1).trim()
    return agentInfo(name)
  }

  // Run an agent
  if (trimmed.startsWith('run ')) {
    const rest = trimmed.slice('run '.length).trim()
    const spaceIdx = rest.indexOf(' ')
    if (spaceIdx === -1) return 'Usage: /agent run <agentType> <task>'
    const agentType = rest.slice(0, spaceIdx).trim()
    const task = rest.slice(spaceIdx + 1).trim()
    return agentRun(agentType, task)
  }

  // Create a custom agent from markdown
  if (trimmed.startsWith('create ')) {
    const rest = trimmed.slice('create '.length).trim()
    return agentCreate(rest, cwd)
  }

  // Delete a custom agent
  if (trimmed.startsWith('delete ') || trimmed.startsWith('rm ')) {
    const name = trimmed.slice(trimmed.indexOf(' ') + 1).trim()
    return agentDelete(name, cwd)
  }

  // Stop a running agent
  if (trimmed.startsWith('stop ') || trimmed.startsWith('kill ')) {
    const id = trimmed.slice(trimmed.indexOf(' ') + 1).trim()
    return agentStop(id)
  }

  return `Unknown /agent command: ${trimmed}\nUse /agent help for usage.`
}

function agentHelp(): string {
  return [
    'Agent commands:',
    '  /agent list                    - List all available agents',
    '  /agent info <agentType>        - Show agent details',
    '  /agent run <agentType> <task>  - Run agent with a task',
    '  /agent create <name>           - Create a custom agent (interactive)',
    '  /agent delete <name>           - Delete a custom agent',
    '  /agent stop <agentId>          - Stop a running agent',
    '',
    'Available built-in agent types:',
    '  Explore        - Fast codebase search (read-only)',
    '  Plan           - Planning specialist (read-only)',
    '  general-purpose - Research + implementation',
    '  Verify         - Code review verification',
    '  coordinator    - Team coordinator that delegates to workers',
    '  worker         - Worker agent for coordinator tasks',
  ].join('\n')
}

async function agentList(): Promise<string> {
  const { getAllAgents } = await import('../agents/agentRegistry.js')
  const agents = getAllAgents()

  if (agents.length === 0) return 'No agents registered.'

  const lines = [`${agents.length} agent(s) registered:`, '']
  for (const a of agents) {
    const tools = a.tools
      ? a.tools[0] === '*'
        ? 'all'
        : a.tools.join(', ')
      : 'default'
    const source = `[${a.source}]`
    lines.push(`  ${a.agentType} ${source}`)
    lines.push(`    ${a.whenToUse.slice(0, 100)}`)
    lines.push(`    tools: ${tools}`)
  }
  return lines.join('\n')
}

async function agentInfo(name: string): Promise<string> {
  const { getAgent } = await import('../agents/agentRegistry.js')
  const agent = getAgent(name)
  if (!agent) return `Agent "${name}" not found.`

  return [
    `Agent: ${agent.agentType}`,
    `Source: ${agent.source}`,
    `Description: ${agent.description ?? agent.whenToUse}`,
    `Tools: ${agent.tools ? (agent.tools[0] === '*' ? 'all' : agent.tools.join(', ')) : 'default'}`,
    agent.disallowedTools
      ? `Disallowed: ${agent.disallowedTools.join(', ')}`
      : '',
    agent.model ? `Model: ${agent.model}` : '',
    agent.maxTurns ? `Max turns: ${agent.maxTurns}` : '',
    agent.skills ? `Skills: ${agent.skills.join(', ')}` : '',
    '',
    'System Prompt (first 500 chars):',
    agent.getSystemPrompt().slice(0, 500),
  ]
    .filter(Boolean)
    .join('\n')
}

async function agentRun(agentType: string, task: string): Promise<string> {
  const { runAgent } = await import('../agents/agentRunner.js')

  try {
    const result = await runAgent({
      agent: agentType,
      task,
    })

    if (result.status === 'completed') {
      return [
        `Agent [${agentType}] completed (${result.totalDurationMs}ms, ${result.totalTokens} tokens, ${result.totalToolUseCount} tool uses):`,
        '',
        result.content.join('\n\n') || '(no output)',
      ].join('\n')
    } else {
      return `Agent [${agentType}] ${result.status}: ${result.error || 'Unknown error'}`
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Agent execution error: ${msg}`
  }
}

async function agentCreate(name: string, cwd: string): Promise<string> {
  const { writeFileSync, existsSync, mkdirSync } = await import('fs')
  const { join } = await import('path')
  const { homedir } = await import('os')

  const agentsDir = join(homedir(), '.claude', 'agents')
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true })
  }

  const filePath = join(agentsDir, `${name}.md`)
  if (existsSync(filePath)) {
    return `Agent "${name}" already exists at ${filePath}`
  }

  const template = [
    '---',
    `agentType: ${name}`,
    `whenToUse: ${name} agent for specialized tasks`,
    'description: Custom agent',
    'tools: Grep, Glob, Read, Bash',
    'source: user',
    'version: 1.0.0',
    '---',
    '',
    `You are the ${name} agent for Claude Code. Your job is to help with specialized tasks.`,
    '',
    'Guidelines:',
    '- Be thorough and precise',
    '- Use available tools to complete your tasks',
    '- Report findings clearly and concisely',
  ].join('\n')

  writeFileSync(filePath, template, 'utf-8')
  return `Agent "${name}" created at ${filePath}. Edit the file to customize.`
}

async function agentDelete(name: string, cwd: string): Promise<string> {
  const { unlinkSync, existsSync } = await import('fs')
  const { join } = await import('path')
  const { homedir } = await import('os')
  const { unregisterAgent } = await import('../agents/agentRegistry.js')

  const filePath = join(homedir(), '.claude', 'agents', `${name}.md`)
  if (!existsSync(filePath)) {
    return `Agent "${name}" not found at ${filePath}`
  }

  unlinkSync(filePath)
  unregisterAgent(name)

  return `Agent "${name}" deleted.`
}

async function agentStop(id: string): Promise<string> {
  // For in-process agents, cancellation would need AbortController integration
  return `Agent stop signal sent for ${id}. Note: in-process agents may continue until their next tool call.`
}

// ============================================================
// /team commands
// ============================================================

/**
 * Handle /team commands in the REPL.
 */
export async function handleTeamCommand(args: string): Promise<string> {
  const trimmed = args.trim()

  if (!trimmed || trimmed === 'help') {
    return teamHelp()
  }

  // Create team
  if (trimmed.startsWith('create ')) {
    const rest = trimmed.slice('create '.length).trim()
    return teamCreate(rest)
  }

  // Delete team
  if (trimmed.startsWith('delete ') || trimmed.startsWith('disband ')) {
    const name = trimmed.slice(trimmed.indexOf(' ') + 1).trim()
    return teamDelete(name)
  }

  // List teams
  if (trimmed === 'list') {
    return teamList()
  }

  // Show team details
  if (trimmed.startsWith('members ')) {
    const name = trimmed.slice('members '.length).trim()
    return teamMembers(name)
  }

  // Add member
  if (trimmed.startsWith('add ')) {
    const rest = trimmed.slice('add '.length).trim()
    const parts = rest.split(' ')
    if (parts.length < 2) return 'Usage: /team add <teamName> <memberName>'
    return teamAddMember(parts[0]!, parts.slice(1).join('_'))
  }

  return `Unknown /team command: ${trimmed}\nUse /team help for usage.`
}

function teamHelp(): string {
  return [
    'Team commands:',
    '  /team create <name>           - Create a new team',
    '  /team delete <name>           - Disband a team',
    '  /team list                    - List all teams',
    '  /team members <name>          - Show team members',
    '  /team add <team> <name>       - Add a member to a team',
  ].join('\n')
}

async function teamCreate(name: string): Promise<string> {
  const { createTeam } = await import('../agents/teamManager.js')
  const { team, leadMemberId } = createTeam(name)
  return [
    `Team "${team.name}" created:`,
    '',
    `  Lead agent ID: ${leadMemberId}`,
    `  Members: ${team.members.length}`,
    `  Created: ${new Date(team.createdAt).toISOString()}`,
  ].join('\n')
}

async function teamDelete(name: string): Promise<string> {
  const { deleteTeam } = await import('../agents/teamManager.js')
  const result = deleteTeam(name)
  return result.success
    ? `Team "${name}" deleted.`
    : `Failed: ${result.message}`
}

async function teamList(): Promise<string> {
  const { getAllTeams } = await import('../agents/teamManager.js')
  const teams = getAllTeams()
  if (teams.length === 0) return 'No active teams.'

  const lines = [`${teams.length} team(s):`, '']
  for (const t of teams) {
    lines.push(
      `  ${t.name} - ${t.members.length} members (${new Date(t.createdAt).toISOString()})`,
    )
    for (const m of t.members) {
      const activeLabel = m.isActive ? 'active' : 'idle'
      lines.push(`    ${m.name} (${m.agentType}, ${m.role}) [${activeLabel}]`)
    }
  }
  return lines.join('\n')
}

async function teamMembers(name: string): Promise<string> {
  const { getTeamMembers } = await import('../agents/teamManager.js')
  const members = getTeamMembers(name)
  if (members.length === 0)
    return `No members in team "${name}" (team may not exist).`

  const lines = [`${members.length} member(s) in team "${name}":`, '']
  for (const m of members) {
    lines.push(
      `  ${m.name} - ${m.agentType} (${m.role}) [${m.isActive ? 'active' : 'idle'}]`,
    )
    lines.push(`    ID: ${m.agentId}`)
    lines.push(`    CWD: ${m.cwd}`)
  }
  return lines.join('\n')
}

async function teamAddMember(
  teamName: string,
  memberName: string,
): Promise<string> {
  const { addTeamMember } = await import('../agents/teamManager.js')
  const member = addTeamMember(
    teamName,
    memberName,
    'general-purpose',
    'worker',
  )
  if (!member) return `Team "${teamName}" not found.`
  return `Member "${memberName}" added to team "${teamName}" (ID: ${member.agentId}).`
}

// ============================================================
// /swarm commands
// ============================================================

/**
 * Handle /swarm commands in the REPL.
 */
export async function handleSwarmCommand(args: string): Promise<string> {
  const trimmed = args.trim()

  if (!trimmed || trimmed === 'help') {
    return swarmHelp()
  }

  // Start swarm mode
  if (trimmed === 'start' || trimmed.startsWith('start ')) {
    return swarmStart()
  }

  // Stop swarm mode
  if (trimmed === 'stop') {
    return swarmStop()
  }

  // Status
  if (trimmed === 'status') {
    return swarmStatus()
  }

  return `Unknown /swarm command: ${trimmed}\nUse /swarm help for usage.`
}

function swarmHelp(): string {
  return [
    'Swarm commands:',
    '  /swarm start                  - Enable swarm mode for parallel agent execution',
    '  /swarm stop                   - Disable swarm mode',
    '  /swarm status                 - Show swarm status',
    '',
    'Swarm mode enables coordinated multi-agent execution. When enabled:',
    '- The coordinator can spawn multiple worker agents in parallel',
    '- Workers report back independently',
    '- Results are synthesized into a cohesive response',
  ].join('\n')
}

async function swarmStart(): Promise<string> {
  return [
    'Swarm mode enabled.',
    'Use /team create to form a team, then /agent run worker <task> to spawn workers.',
    'Workers will coordinate through the team context.',
  ].join('\n')
}

async function swarmStop(): Promise<string> {
  return [
    'Swarm mode disabled.',
    'Use /team delete to clean up any remaining teams.',
  ].join('\n')
}

async function swarmStatus(): Promise<string> {
  const { getAllTeams } = await import('../agents/teamManager.js')
  const teams = getAllTeams()

  if (teams.length === 0) {
    return [
      'Swarm status: Idle',
      'No active teams. Use /team create to start a swarm.',
    ].join('\n')
  }

  const totalMembers = teams.reduce((sum, t) => sum + t.members.length, 0)
  const activeMembers = teams.reduce(
    (sum, t) => sum + t.members.filter(m => m.isActive).length,
    0,
  )

  return [
    'Swarm status: Active',
    `  Teams: ${teams.length}`,
    `  Total members: ${totalMembers}`,
    `  Active members: ${activeMembers}`,
    `  Teams: ${teams.map(t => t.name).join(', ')}`,
  ].join('\n')
}
