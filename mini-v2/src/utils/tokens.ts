/**
 * Rough token counting utility (4 chars ¡Ö 1 token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens from messages
 */
export function estimateTotalTokens(messages: Array<{ content?: unknown }>): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (typeof block === 'string') {
          total += estimateTokens(block);
        } else if (block && typeof block === 'object' && 'text' in block) {
          total += estimateTokens(String((block as { text: string }).text));
        }
      }
    }
  }
  return total;
}
