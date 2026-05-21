/**
 * Model name alias mapping for the mini CLI.
 * Maps short aliases ("sonnet", "opus") to full model IDs.
 */

export const MODEL_ALIASES: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-3-5-haiku-20241022',
  'sonnet-3.5': 'claude-3-5-sonnet-20241022',
  qwen: 'qwen-max',
  'qwen-max': 'qwen-max',
  'qwen-plus': 'qwen-plus',
  'qwen-turbo': 'qwen-turbo',
  'qwen-coder': 'qwen-coder-plus',
}

export function resolveModelAlias(name: string): string {
  const lower = name.toLowerCase().trim()
  return MODEL_ALIASES[lower] ?? name
}
