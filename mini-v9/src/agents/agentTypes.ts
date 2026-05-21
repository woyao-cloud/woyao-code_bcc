// ============================================================
// Agent Type Definitions for mini-v8
// ============================================================
// Models: AgentDefinition, AgentInstance, Team,
//         AgentContext for async-local tracking, AgentRole
// ============================================================

// ---------- Agent Definition ----------

/** Where an agent definition comes from */
export type AgentSource = 'built-in' | 'user' | 'project' | 'plugin' | 'local'

/**
 * Agent definition - the blueprint for a runnable agent.
 * Analogous to AgentDefinition in loadAgentsDir.ts but
 * simplified for the mini architecture.
 */
export interface AgentDefinition {
  /** Unique type/key for this agent (e.g. "Explore", "code-reviewer") */
  agentType: string
  /** Instructions for when the orchestrator should use this agent */
  whenToUse: string
  /** Human-readable description */
  description?: string
  /** Allowed tool names; '*' means all tools */
  tools?: string[]
  /** Explicitly disallowed tool names */
  disallowedTools?: string[]
  /** Skill names to preload */
  skills?: string[]
  /** MCP server names/specs for this agent */
  mcpServers?: string[]
  /** Custom system prompt (function because it may include dynamic data) */
  getSystemPrompt: () => string
  /** Filename (without .md) for user/project agents */
  filename?: string
  /** Model override for this agent */
  model?: string
  /** Max turns before auto-stopping */
  maxTurns?: number
  /** Permission mode override */
  permissionMode?: string
  /** Whether this is a built-in agent */
  source: AgentSource
  /** Base directory for the agent definition */
  baseDir?: string
  /** Color assigned for UI */
  color?: string
  /** Whether to always run as background task */
  background?: boolean
  /** Initial prompt prepended to first user turn */
  initialPrompt?: string
  /** Memory scope for persistent cross-session memory */
  memory?: 'user' | 'project' | 'local'
  /** Skip CLAUDE.md injection into system context (saves tokens for agents that don't need project conventions) */
  omitClaudeMd?: boolean
}

// ---------- Agent Instance ----------

/** Status of a running agent */
export type AgentStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/**
 * A concrete running instance of an agent.
 */
export interface AgentInstance {
  /** Unique instance ID (UUID) */
  id: string
  /** The definition this instance was created from */
  definition: AgentDefinition
  /** Instance status */
  status: AgentStatus
  /** Task description assigned to this instance */
  task: string
  /** Results collected so far */
  result: string[]
  /** Error message if failed */
  error?: string
  /** Turn counter */
  turnCount: number
  /** When this instance was created */
  createdAt: Date
  /** Token usage tracking */
  totalInputTokens: number
  totalOutputTokens: number
}

// ---------- Team / Swarm ----------

/** Role within a team */
export type AgentRole = 'lead' | 'worker' | 'coordinator'

/**
 * A member of a team.
 */
export interface TeamMember {
  /** Instance ID of the agent */
  agentId: string
  /** Display name */
  name: string
  /** Agent type / role */
  agentType: string
  /** Role in the team */
  role: AgentRole
  /** Model used */
  model?: string
  /** When this member joined */
  joinedAt: number
  /** Working directory */
  cwd: string
  /** Whether this member is currently active */
  isActive: boolean
}

/**
 * Team definition.
 */
export interface TeamDefinition {
  /** Unique team name */
  name: string
  /** Optional description */
  description?: string
  /** When the team was created */
  createdAt: number
  /** The lead agent's instance ID */
  leadAgentId: string
  /** The lead's session ID */
  leadSessionId: string
  /** All team members */
  members: TeamMember[]
}

// ---------- Agent Context (in-process async tracking) ----------

/**
 * Lightweight agent context for in-process tracking.
 * Stored in a module-level Map keyed by agent instance ID.
 * This replaces the AsyncLocalStorage pattern used in the
 * full Claude Code for simplicity.
 */
export interface AgentRunContext {
  /** The agent instance ID */
  agentId: string
  /** The parent session ID (if any) */
  parentSessionId?: string
  /** The agent type */
  agentType: string
  /** Team name if this agent belongs to a team */
  teamName?: string
  /** Whether this agent is the team lead */
  isTeamLead: boolean
  /** When this run started */
  startTime: number
}

// ---------- Agent Result ----------

/**
 * The result returned by a completed agent run.
 */
export interface AgentResult {
  /** Instance ID */
  agentId: string
  /** Status */
  status: AgentStatus
  /** Collected output messages as text */
  content: string[]
  /** Token usage */
  totalTokens: number
  /** Total tool uses */
  totalToolUseCount: number
  /** Duration in ms */
  totalDurationMs: number
  /** Error message if failed */
  error?: string
}

// ---------- Agent Progress (for async tracking) ----------

/** Live progress snapshot for a running agent */
export interface AgentProgress {
  /** Current turn count */
  turnCount: number
  /** Cumulative tokens */
  totalTokens: number
  /** Total tool uses so far */
  toolUseCount: number
  /** Timestamp of last activity */
  lastActivity: number
  /** Optional text summary (from periodic summarization) */
  summary?: string
}

// ---------- Agent Task State (for async lifecycle) ----------

/** Unique identifier for a task */
export type TaskId = string

/** Lifecycle status for an agent task */
export type AgentTaskStatus = 'running' | 'completed' | 'failed' | 'killed'

/** Full state of an agent task (used by AgentTaskStore) */
export interface AgentTaskState {
  /** Unique task ID */
  taskId: TaskId
  /** The agent instance ID */
  agentId: string
  /** Agent type string */
  agentType: string
  /** Display name for the agent */
  agentName?: string
  /** Lifecycle status */
  status: AgentTaskStatus
  /** Original task prompt */
  prompt: string
  /** Model being used */
  model: string
  /** Tool use ID that spawned this task (for notification correlation) */
  toolUseId?: string
  /** Start timestamp */
  startTime: number
  /** End timestamp (set on completion/failure) */
  endTime?: number
  /** Live progress data */
  progress: AgentProgress
  /** Final result (set on completion) */
  result?: AgentResult
  /** Error message (set on failure) */
  error?: string
  /** Abort controller for cancellation */
  abortController: AbortController
  /** Whether a task-notification has already been sent */
  notified: boolean
}
