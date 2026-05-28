/**
 * Token Budget utilities — parse shorthand, find positions, generate messages.
 */

// ============================================================
// Regex patterns
// ============================================================

/** Shorthand like "+500k" or "+1m" at start of input */
const SHORTHAND_START_RE = /^\s*\+?\d+(k|m|b)\b/i

/** Shorthand at end of input like " /50k" */
const SHORTHAND_END_RE = /\s+\+?\d+(k|m|b)\s*$/

/** Verbose format: "500000 tokens" */
const VERBOSE_RE_G = /\b\d+\s*tokens?\b/gi

// ============================================================
// Public API
// ============================================================

/**
 * Parse a token budget shorthand string into a number.
 * Supports: "+500k", "50k", "1m", "1000000", etc.
 * Returns null if the input can't be parsed.
 */
export function parseTokenBudget(shorthand: string): number | null {
  const cleaned = shorthand.replace(/^\+/, '').trim().toLowerCase()
  const match = cleaned.match(/^(\d+)(k|m|b)?$/)
  if (!match) return null

  const value = parseInt(match[1]!, 10)
  const unit = match[2]

  switch (unit) {
    case 'k': return value * 1000
    case 'm': return value * 1000 * 1000
    case 'b': return value * 1000 * 1000 * 1000
    default: return value // raw number
  }
}

/**
 * Find all token budget shorthand positions in text.
 * Returns array of {start, end} positions for highlighting.
 */
export function findTokenBudgetPositions(
  text: string,
): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = []
  const startMatch = text.match(SHORTHAND_START_RE)
  if (startMatch) {
    const offset =
      startMatch.index! +
      startMatch[0].length -
      startMatch[0].trimStart().length
    positions.push({
      start: offset,
      end: startMatch.index! + startMatch[0].length,
    })
  }
  const endMatch = text.match(SHORTHAND_END_RE)
  if (endMatch) {
    const endStart = endMatch.index! + 1
    const alreadyCovered = positions.some(
      p => endStart >= p.start && endStart < p.end,
    )
    if (!alreadyCovered) {
      positions.push({
        start: endStart,
        end: endMatch.index! + endMatch[0].length,
      })
    }
  }
  for (const match of text.matchAll(VERBOSE_RE_G)) {
    positions.push({ start: match.index, end: match.index + match[0].length })
  }
  return positions
}

/**
 * Generate a human-readable budget continuation nudge message.
 */
export function getBudgetContinuationMessage(
  pct: number,
  turnTokens: number,
  budget: number,
): string {
  const fmt = (n: number): string => new Intl.NumberFormat('en-US').format(n)
  return `Stopped at ${pct}% of token target (${fmt(turnTokens)} / ${fmt(budget)}). Keep working — do not summarize.`
}
