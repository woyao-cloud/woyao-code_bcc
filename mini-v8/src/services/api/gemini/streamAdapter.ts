import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { GeminiStreamChunk } from './client.js'

/**
 * Adapt Gemini streaming response into Anthropic stream events.
 * Converts:
 *   - text parts -> content_block_start + content_block_delta (text)
 *   - functionCall -> content_block_start (tool_use) + input_json_delta
 *   - finish -> message_delta
 */
export async function* geminiToAnthropicStream(
  geminiStream: AsyncGenerator<GeminiStreamChunk>,
): AsyncGenerator<BetaRawMessageStreamEvent> {
  let contentBlockIndex = 0
  let hasTextBlock = false
  let textBlockIndex = -1
  let totalInputTokens = 0
  let totalOutputTokens = 0

  for await (const chunk of geminiStream) {
    if (chunk.usageMetadata) {
      totalInputTokens = chunk.usageMetadata.promptTokenCount
      totalOutputTokens = chunk.usageMetadata.candidatesTokenCount
    }

    const candidates = chunk.candidates
    if (!candidates || candidates.length === 0) continue

    for (const candidate of candidates) {
      const content = candidate.content
      if (!content || !content.parts) continue

      for (const part of content.parts) {
        if (part.text !== undefined) {
          if (!hasTextBlock) {
            contentBlockIndex++
            textBlockIndex = contentBlockIndex
            hasTextBlock = true
            yield {
              type: 'content_block_start',
              index: contentBlockIndex,
              content_block: { type: 'text', text: '' },
            } as BetaRawMessageStreamEvent
          }

          yield {
            type: 'content_block_delta',
            index: textBlockIndex,
            delta: { type: 'text_delta', text: part.text },
          } as BetaRawMessageStreamEvent
        }

        if (part.functionCall) {
          contentBlockIndex++
          const fc = part.functionCall
          yield {
            type: 'content_block_start',
            index: contentBlockIndex,
            content_block: {
              type: 'tool_use',
              id: `toolu_gemini_${fc.name ?? 'unknown'}`,
              name: fc.name ?? 'unknown',
              input: {},
            },
          } as BetaRawMessageStreamEvent

          yield {
            type: 'content_block_delta',
            index: contentBlockIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: JSON.stringify(fc.args ?? {}),
            },
          } as BetaRawMessageStreamEvent
        }
      }

      if (candidate.finishReason) {
        yield {
          type: 'message_delta',
          delta: {
            stop_reason: mapFinishReason(candidate.finishReason),
            stop_sequence: null,
          },
          usage: { output_tokens: totalOutputTokens },
        } as BetaRawMessageStreamEvent

        yield {
          type: 'message_stop',
        } as BetaRawMessageStreamEvent
      }
    }
  }
}

function mapFinishReason(reason: string): string {
  switch (reason) {
    case 'STOP':
      return 'end_turn'
    case 'FUNCTION_CALL':
    case 'TOOL_CALL':
      return 'tool_use'
    case 'MAX_TOKENS':
      return 'max_tokens'
    case 'SAFETY':
      return 'end_turn'
    default:
      return reason.toLowerCase()
  }
}
