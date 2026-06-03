export type AgentId = string & { __brand: 'AgentId' }
export type SessionId = string & { __brand: 'SessionId' }
export type MessageUuid = string & { __brand: 'MessageUuid' }

export function agentId(id: string): AgentId {
  return id as AgentId
}

export function sessionId(id: string): SessionId {
  return id as SessionId
}

export function messageUuid(id: string): MessageUuid {
  return id as MessageUuid
}

/**
 * Query chain tracking for subagent nesting depth
 */
export type QueryChainTracking = {
  chainId: string
  depth: number
}
