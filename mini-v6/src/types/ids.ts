export type AgentId = string & { __brand: 'AgentId' }
export type SessionId = string & { __brand: 'SessionId' }

export function agentId(id: string): AgentId {
  return id as AgentId
}

export function sessionId(id: string): SessionId {
  return id as SessionId
}
