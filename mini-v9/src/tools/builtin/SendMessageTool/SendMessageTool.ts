import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { sendProtocolMessage } from '../../../agents/teammateMailbox.js'

export const SendMessageTool: Tool = {
  name: 'SendMessage',
  description:
    'Send a message to a teammate within the same team. Use for coordination, delegating tasks, or sharing information with other agents in your swarm.',
  inputSchema: {
    type: 'object',
    properties: {
      recipient: {
        type: 'string',
        description:
          'The name of the teammate to send the message to (e.g. "team-lead", "worker-1")',
      },
      message: {
        type: 'string',
        description: 'The message content to send',
      },
      team: {
        type: 'string',
        description: 'Team name (optional, defaults to current team context)',
      },
    },
    required: ['recipient', 'message'],
  },
  prompt:
    'SendMessage tool: send a message to a teammate. Use for coordinating with other agents in the same team.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const recipient = String(input.recipient ?? '').trim()
    const message = String(input.message ?? '').trim()
    const team = input.team ? String(input.team).trim() : undefined

    if (!recipient) {
      return {
        content: 'Recipient name is required',
        success: false,
        error: 'Missing recipient',
      }
    }
    if (!message) {
      return {
        content: 'Message content is required',
        success: false,
        error: 'Missing message',
      }
    }

    const senderName = 'agent-' + (ctx.toolUse.id ?? 'unknown').slice(0, 8)
    const teamName = team ?? 'default'

    sendProtocolMessage(
      recipient,
      {
        type: 'text_message',
        from: senderName,
        payload: { text: message },
      },
      teamName,
    )

    return {
      content: `Message sent to "${recipient}" in team "${teamName}".`,
      success: true,
      metadata: { recipient, teamName },
    }
  },

  userFacingName: () => 'SendMessage',
}
