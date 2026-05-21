// ============================================================
// Agent Context Isolation via AsyncLocalStorage
// ============================================================
// Uses Node.js AsyncLocalStorage to provide per-agent-context
// identity across async operations. Solves the fundamental
// problem of concurrent agents sharing the same process.
//
// WHY ALS over Map<agentId, context>:
// When agents are backgrounded, multiple agents can run
// concurrently. A module-level Map would have "last-write-wins"
// semantics — Agent A's events would incorrectly report
// Agent B's context. AsyncLocalStorage isolates each async
// execution chain so concurrent agents don't interfere.
// ============================================================

import { AsyncLocalStorage } from 'node:async_hooks'

// ---------- Context Types ----------

/** Context for Agent-tool spawned subagents */
export interface SubagentContext {
  /** Unique agent instance ID */
  agentId: string
  /** Agent type string (e.g. "Explore", "worker") */
  agentType: string
  /** Human-readable name */
  agentName?: string
  /** Parent agent ID (for nesting) */
  parentAgentId?: string
  /** Team name if part of a team */
  teamName?: string
  /** Whether this agent runs asynchronously */
  isAsync: boolean
  /** Whether this is the team lead */
  isTeamLead: boolean
  /** When execution started */
  startTime: number
}

/** Context for swarm teammates */
export interface TeammateContext {
  agentId: string
  agentName: string
  agentType: string
  teamName: string
  agentColor?: string
  isTeamLead: boolean
  isAsync: boolean
  startTime: number
}

/** Union of possible agent contexts */
export type AgentContext = SubagentContext | TeammateContext

// ---------- ALS Store ----------

const agentContextStore = new AsyncLocalStorage<AgentContext>()

// ---------- Core API ----------

/**
 * Run a function within an agent context.
 * All code in the async chain (including nested awaits) can
 * retrieve this context via getAgentContext().
 */
export function runWithAgentContext<T>(
  context: AgentContext,
  fn: () => Promise<T>,
): Promise<T> {
  return agentContextStore.run(context, fn)
}

/**
 * Get the current agent context from the async execution chain.
 * Returns undefined if called outside of an agent context
 * (e.g., in the main thread).
 */
export function getAgentContext(): AgentContext | undefined {
  return agentContextStore.getStore()
}

// ---------- Type Guards ----------

/** Check if the current context is a subagent context */
export function isSubagentContext(ctx?: AgentContext): ctx is SubagentContext {
  return ctx !== undefined && 'parentAgentId' in ctx
}

/** Check if the current context is a teammate context */
export function isTeammateContext(ctx?: AgentContext): ctx is TeammateContext {
  return ctx !== undefined && 'agentColor' in ctx
}

// ---------- Convenience Helpers ----------

/** Get the current agent ID, or a fallback string */
export function getCurrentAgentId(): string | undefined {
  return getAgentContext()?.agentId
}

/** Check if we're running inside any agent context */
export function isInAgentContext(): boolean {
  return getAgentContext() !== undefined
}

/** Check if we're running in an async (non-blocking) agent */
export function isAsyncAgent(): boolean {
  const ctx = getAgentContext()
  return ctx !== undefined && ctx.isAsync
}

/** Get a short log prefix for the current agent context */
export function getAgentLogPrefix(): string {
  const ctx = getAgentContext()
  if (!ctx) return '[main]'
  const agentType = ctx.agentType
  const id = ctx.agentId.slice(0, 8)
  const isTeam = 'teamName' in ctx && ctx.teamName !== undefined
  if (isTeam) {
    const teamCtx = ctx as SubagentContext | TeammateContext
    return `[${teamCtx.teamName}/${agentType}:${id}]`
  }
  return `[${agentType}:${id}]`
}

/** Build a fresh SubagentContext for a new agent spawn */
export function createSubagentContext(params: {
  agentId: string
  agentType: string
  agentName?: string
  teamName?: string
  isAsync: boolean
  isTeamLead?: boolean
}): SubagentContext {
  const parentCtx = getAgentContext()
  return {
    agentId: params.agentId,
    agentType: params.agentType,
    agentName: params.agentName ?? params.agentType,
    parentAgentId: parentCtx?.agentId,
    teamName: params.teamName,
    isAsync: params.isAsync,
    isTeamLead: params.isTeamLead ?? false,
    startTime: Date.now(),
  }
}

/** Build a fresh TeammateContext for swarm spawning */
export function createTeammateContext(params: {
  agentId: string
  agentName: string
  agentType: string
  teamName: string
  agentColor?: string
  isAsync: boolean
  isTeamLead?: boolean
}): TeammateContext {
  return {
    agentId: params.agentId,
    agentName: params.agentName,
    agentType: params.agentType,
    teamName: params.teamName,
    agentColor: params.agentColor,
    isAsync: params.isAsync,
    isTeamLead: params.isTeamLead ?? false,
    startTime: Date.now(),
  }
}
