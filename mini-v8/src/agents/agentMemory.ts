// ============================================================
// Agent Memory System for mini-v8
// ============================================================
// Provides persistent cross-session memory for agents.
// Pattern: MEMORY.md index file + topic files in a directory.
//
// Directory layout:
//   user scope:    ~/.claude/agent-memory/<agentType>/
//   project scope: .cwd/.claude/agent-memory/<agentType>/
//   local scope:   .cwd/.claude/agent-memory-local/<agentType>/
//
// Each directory contains:
//   MEMORY.md    — index file (links to topic files, max 200 lines)
//   <topic>.md   — individual memory topic files (with frontmatter)
// ============================================================

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'

// ---------- Constants ----------

const MAX_MEMORY_INDEX_LINES = 200
const MAX_MEMORY_PROMPT_CHARS = 25000

// ---------- Types ----------

/** Frontmatter for a memory topic file */
interface MemoryFrontmatter {
  name: string
  description: string
  metadata: {
    type: 'user' | 'feedback' | 'project' | 'reference'
  }
}

// ---------- Path Helpers ----------

export function getAgentMemoryDir(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  cwd?: string,
): string {
  switch (scope) {
    case 'user':
      return join(homedir(), '.claude', 'agent-memory', agentType)
    case 'project':
      return join(cwd ?? process.cwd(), '.claude', 'agent-memory', agentType)
    case 'local':
      return join(
        cwd ?? process.cwd(),
        '.claude',
        'agent-memory-local',
        agentType,
      )
  }
}

// ---------- Directory Setup ----------

export function ensureAgentMemoryDir(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  cwd?: string,
): string {
  const dir = getAgentMemoryDir(agentType, scope, cwd)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const indexPath = join(dir, 'MEMORY.md')
  if (!existsSync(indexPath)) {
    const initialContent = [
      '# Agent Memory Index',
      '',
      `Agent: ${agentType}`,
      `Scope: ${scope}`,
      `Created: ${new Date().toISOString()}`,
      '',
      'This index tracks memory files for this agent. Each entry links to a topic file.',
      '',
      '---',
      '',
      'No memories yet.',
      '',
    ].join('\n')
    writeFileSync(indexPath, initialContent, 'utf-8')
  }

  return dir
}

// ---------- Memory Prompt Loading ----------

const MEMORY_TYPE_DEFINITIONS = `
## Memory System

You have a persistent, file-based memory system. The memory directory is already created — write to it directly; do not run mkdir or check for its existence.

You should build up this memory system over time so that future conversations can have a complete picture of the user, their preferences, and the context behind the work.

### Types of memory

**user** — Information about the user's role, goals, responsibilities, and knowledge. Helps tailor future behavior to the user's profile.
**feedback** — Guidance the user has given you about how to approach work — both what to avoid and what to keep doing.
**project** — Information about ongoing work, goals, initiatives, bugs, or incidents that is not derivable from code or git history.
**reference** — Pointers to where information can be found in external systems (Linear, Slack, Grafana, etc.).

### What NOT to save

- Code patterns, conventions, architecture, file paths — derivable from reading the project
- Git history, recent changes — git log / git blame are authoritative
- Debugging solutions or fix recipes — the fix is in the code
- Anything already documented in CLAUDE.md files
- Ephemeral task details: in-progress work, temporary state

### How to save memories

**Step 1** — Write the memory to its own topic file (e.g. \`user_role.md\`, \`feedback_testing.md\`) using frontmatter format:

\`\`\`markdown
---
name: {{short-kebab-case-slug}}
description: {{one-line summary}}
metadata:
  type: {{user|feedback|project|reference}}
---

{{memory content}}
\`\`\`

**Step 2** — Update MEMORY.md index with a link: \`- [Title](file.md) — one-line hook\`

- MEMORY.md is an index, not a memory — each entry should be one line
- Organize memory semantically by topic, not chronologically
- Update or remove memories that are wrong or outdated
- Do not write duplicate memories
`.trim()

function loadMemoryIndex(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  cwd?: string,
): string {
  const dir = getAgentMemoryDir(agentType, scope, cwd)
  const indexPath = join(dir, 'MEMORY.md')

  if (!existsSync(indexPath)) return ''

  try {
    const content = readFileSync(indexPath, 'utf-8')
    // Enforce line limit
    const lines = content.split('\n')
    if (lines.length > MAX_MEMORY_INDEX_LINES) {
      return lines.slice(0, MAX_MEMORY_INDEX_LINES).join('\n')
    }
    return content
  } catch {
    return ''
  }
}

function loadTopicContents(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  cwd?: string,
): string {
  const dir = getAgentMemoryDir(agentType, scope, cwd)
  if (!existsSync(dir)) return ''

  try {
    const entries = readdirSync(dir)
    const topicFiles = entries.filter(
      e => e.endsWith('.md') && e !== 'MEMORY.md',
    )

    if (topicFiles.length === 0) return ''

    const contents: string[] = []
    for (const file of topicFiles.slice(0, 20)) {
      try {
        const content = readFileSync(join(dir, file), 'utf-8')
        contents.push(content.slice(0, 4000)) // per-file cap
      } catch {
        // skip unreadable files
      }
    }

    return contents.join('\n\n---\n\n')
  } catch {
    return ''
  }
}

export function loadAgentMemoryPrompt(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  cwd?: string,
): string {
  const indexContent = loadMemoryIndex(agentType, scope, cwd)
  const topicContent = loadTopicContents(agentType, scope, cwd)

  const parts: string[] = [MEMORY_TYPE_DEFINITIONS]

  if (indexContent) {
    parts.push('\n## Current Memory Index\n')
    parts.push(indexContent)
  }

  if (topicContent) {
    parts.push('\n## Memory Topic Contents\n')
    parts.push(topicContent)
  }

  let prompt = parts.join('\n')

  // Enforce total char limit
  if (prompt.length > MAX_MEMORY_PROMPT_CHARS) {
    prompt =
      prompt.slice(0, MAX_MEMORY_PROMPT_CHARS - 200) +
      '\n\n[Memory prompt truncated to fit token budget.]'
  }

  return prompt
}

// ---------- Memory Writes ----------

export function writeMemoryTopic(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  filename: string,
  content: string,
  cwd?: string,
): string {
  const dir = ensureAgentMemoryDir(agentType, scope, cwd)
  const filePath = join(
    dir,
    filename.endsWith('.md') ? filename : `${filename}.md`,
  )

  writeFileSync(filePath, content, 'utf-8')
  return filePath
}

export function readMemoryIndex(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  cwd?: string,
): string {
  return loadMemoryIndex(agentType, scope, cwd)
}

export function appendToMemoryIndex(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  entry: string,
  cwd?: string,
): void {
  const dir = ensureAgentMemoryDir(agentType, scope, cwd)
  const indexPath = join(dir, 'MEMORY.md')

  let content = ''
  if (existsSync(indexPath)) {
    try {
      content = readFileSync(indexPath, 'utf-8')
    } catch {
      content = ''
    }
  }

  // Remove trailing newlines and "No memories yet." placeholder
  content = content.replace(/\n*No memories yet\.\n*$/, '\n')

  // Add the new entry
  content += `- ${entry}\n`
  writeFileSync(indexPath, content, 'utf-8')
}

// ---------- Directory Management ----------

export function listMemoryTopics(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  cwd?: string,
): string[] {
  const dir = getAgentMemoryDir(agentType, scope, cwd)
  if (!existsSync(dir)) return []

  try {
    return readdirSync(dir).filter(e => e.endsWith('.md') && e !== 'MEMORY.md')
  } catch {
    return []
  }
}

export function deleteMemoryTopic(
  agentType: string,
  scope: 'user' | 'project' | 'local',
  filename: string,
  cwd?: string,
): boolean {
  const dir = getAgentMemoryDir(agentType, scope, cwd)
  const filePath = join(dir, filename)

  if (!existsSync(filePath)) return false

  try {
    unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}
