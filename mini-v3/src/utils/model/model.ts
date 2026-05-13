/**
 * Model types and defaults for the mini CLI
 */

import { resolveModelAlias } from './modelStrings.js'

export type ModelSetting = string

export const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

export const MODELS: Record<
  string,
  { maxTokens: number; displayName: string }
> = {
  'claude-sonnet-4-20250514': {
    maxTokens: 128000,
    displayName: 'Claude Sonnet 4',
  },
  'claude-opus-4-20250514': { maxTokens: 200000, displayName: 'Claude Opus 4' },
  'claude-3-5-sonnet-20241022': {
    maxTokens: 8192,
    displayName: 'Claude 3.5 Sonnet',
  },
  'claude-3-5-haiku-20241022': {
    maxTokens: 8192,
    displayName: 'Claude 3.5 Haiku',
  },
}

export function getMaxTokens(model: string): number {
  return MODELS[model]?.maxTokens ?? 4096
}

export function resolveModel(override?: string): string {
  const resolved = resolveModelAlias(
    override ??
      process.env.ANTHROPIC_MODEL ??
      process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ??
      DEFAULT_MODEL,
  )
  if (MODELS[resolved]) return resolved
  return resolved
}
