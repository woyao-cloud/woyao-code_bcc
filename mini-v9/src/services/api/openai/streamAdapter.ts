/**
 * Stream adapter: converts OpenAI SSE chunks to Anthropic BetaRawMessageStreamEvent format.
 * This allows the downstream tool loop (cli.ts) to work unchanged regardless of provider.
 */

import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { OpenAIStreamChunk } from './client.js'
import { logDebug, logWarning } from '../../../utils/log.js'

/**
 * Extract text content from various OpenAI content formats.
 * Handles: string, array of {type: "text", text: string}, etc.
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'object' && part !== null && 'text' in part) {
          return String((part as { text: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
  }
  return ''
}

/**
 * Adapt OpenAI streaming response into Anthropic stream events.
 * Converts:
 *   - text delta -> content_block_delta (text_delta)
 *   - function call start -> content_block_start (tool_use)
 *   - function call delta -> content_block_delta (input_json_delta)
 *   - finish -> message_delta
 */
export async function* openAIToAnthropicStream(
  openAIStream: AsyncGenerator<OpenAIStreamChunk>,
): AsyncGenerator<BetaRawMessageStreamEvent> {
  let contentBlockIndex = 0
  const toolCallStates = new Map<
    number,
    {
      id: string
      name: string
      started: boolean
    }
  >()
  let currentTextBlockIndex = -1
  let hasStartedTextBlock = false
  let chunkCount = 0

  for await (const chunk of openAIStream) {
    chunkCount++
    const choice = chunk.choices?.[0]
    if (!choice) {
      logDebug(`OpenAI chunk ${chunkCount}: no choices, chunk=${JSON.stringify(chunk).substring(0, 200)}`)
      continue
    }

    const delta = choice.delta
    logDebug(`OpenAI chunk ${chunkCount}: delta=${JSON.stringify(delta).substring(0, 300)}`)

    // Handle text content
    if (delta.content !== undefined && delta.content !== null) {
      const text = extractTextContent(delta.content)
      if (text) {
        if (!hasStartedTextBlock) {
          contentBlockIndex++
          currentTextBlockIndex = contentBlockIndex
          hasStartedTextBlock = true
          yield {
            type: 'content_block_start',
            index: contentBlockIndex,
            content_block: {
              type: 'text',
              text: '',
            },
          } as BetaRawMessageStreamEvent
        }
        yield {
          type: 'content_block_delta',
          index: currentTextBlockIndex,
          delta: {
            type: 'text_delta',
            text,
          },
        } as BetaRawMessageStreamEvent
      }
    }

    // Handle tool calls
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const state = toolCallStates.get(tc.index)

        if (!state) {
          // New tool call starting
          if (tc.id && tc.function?.name) {
            contentBlockIndex++
            const newState = {
              id: tc.id,
              name: tc.function.name,
              started: false,
            }
            toolCallStates.set(tc.index, newState)
          }
        } else if (!state.started) {
          // Emit content_block_start for this tool
          state.started = true
          yield {
            type: 'content_block_start',
            index: contentBlockIndex,
            content_block: {
              type: 'tool_use',
              id: state.id,
              name: state.name,
              input: {},
            },
          } as BetaRawMessageStreamEvent
        }

        // Emit input_json_delta
        const curState = toolCallStates.get(tc.index)
        if (curState?.started && tc.function?.arguments) {
          yield {
            type: 'content_block_delta',
            index: contentBlockIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: tc.function.arguments,
            },
          } as BetaRawMessageStreamEvent
        }
      }
    }

    // Handle finish
    if (choice.finish_reason) {
      yield {
        type: 'message_delta',
        delta: {
          stop_reason: mapFinishReason(choice.finish_reason),
          stop_sequence: null,
        },
        usage: {
          output_tokens: chunk.usage?.completion_tokens ?? 0,
        },
      } as BetaRawMessageStreamEvent

      yield {
        type: 'message_stop',
      } as BetaRawMessageStreamEvent
    }
  }
}

function mapFinishReason(reason: string): string {
  switch (reason) {
    case 'stop':
      return 'end_turn'
    case 'tool_calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    default:
      return reason
  }
}
