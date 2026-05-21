import {
  readUnreadMessages,
  parseProtocolMessage,
  type TeammateMessage,
} from './teammateMailbox.js'

export interface PollOptions {
  pollIntervalMs?: number
  abortSignal: AbortSignal
  pendingTimestamps?: string[]
}

export async function waitForNextMessage(
  agentName: string,
  teamName: string,
  options: PollOptions,
): Promise<TeammateMessage | 'shutdown' | null> {
  const pollInterval = options.pollIntervalMs ?? 500
  const pending = new Set(options.pendingTimestamps ?? [])

  while (!options.abortSignal.aborted) {
    const unread = readUnreadMessages(agentName, teamName)

    for (const msg of unread) {
      if (pending.has(msg.timestamp)) continue

      const protocol = parseProtocolMessage(msg)
      if (protocol && protocol.type === 'shutdown_request') {
        return 'shutdown'
      }

      pending.add(msg.timestamp)
      return msg
    }

    await sleep(pollInterval)
  }

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
