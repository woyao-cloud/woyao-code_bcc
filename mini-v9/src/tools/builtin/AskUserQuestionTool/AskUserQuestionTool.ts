import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { createInterface } from 'readline'
import { stdin as processStdin, stdout as processStdout } from 'process'

export const AskUserQuestionTool: Tool = {
  name: 'AskUserQuestion',
  description:
    'Ask the user a question and wait for their response. Use when you need clarification, input, or decision from the user.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask the user' },
    },
    required: ['question'],
  },
  prompt:
    'AskUserQuestion tool: ask the user for input or clarification. Use when you need a decision, more details, or confirmation.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const question = String(input.question ?? '').trim()
    if (!question) {
      return {
        content: 'Question text is required',
        success: false,
        error: 'Missing question',
      }
    }

    if (!ctx.isInteractive) {
      return {
        content: `Question: ${question}\n(Answer not available in non-interactive mode)`,
        success: true,
      }
    }

    const answer = await askUser(question)
    return {
      content: `Question: ${question}\nAnswer: ${answer}`,
      success: true,
      metadata: { answer },
    }
  },

  userFacingName: () => 'AskUserQuestion',
}

function askUser(question: string): Promise<string> {
  const rl = createInterface({ input: processStdin, output: processStdout })
  return new Promise(resolve => {
    rl.question(`\n[AskUser] ${question}\n> `, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}
