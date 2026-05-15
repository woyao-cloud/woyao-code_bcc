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
  'deepseek-v4-pro:cloud': {
    maxTokens: 128000,
    displayName: 'DeepSeek V4 Pro',
  },
  'deepseek-v4-flash:cloud': {
    maxTokens: 128000,
    displayName: 'DeepSeek V4 Flash',
  },
  'deepseek-v4-pro': {
    maxTokens: 128000,
    displayName: 'DeepSeek V4 Pro (local)',
  },
  'deepseek-v4-flash': {
    maxTokens: 128000,
    displayName: 'DeepSeek V4 Flash (local)',
  },
  'qwen-max': {
    maxTokens: 32000,
    displayName: 'Qwen Max',
  },
  'qwen-plus': {
    maxTokens: 32000,
    displayName: 'Qwen Plus',
  },
  'qwen-turbo': {
    maxTokens: 32000,
    displayName: 'Qwen Turbo',
  },
  'qwen-coder-plus': {
    maxTokens: 32000,
    displayName: 'Qwen Coder Plus',
  },
}

export function getMaxTokens(model: string): number {
  // Exact match
  if (MODELS[model]) return MODELS[model].maxTokens
  // Prefix match for deepseek models (e.g., deepseek-v4-pro:cloud)
  for (const [key, entry] of Object.entries(MODELS)) {
    if (model.startsWith(key)) return entry.maxTokens
  }
  return 32000
}

export function resolveModel(override?: string): string {
  const resolved = resolveModelAlias(
    override ??
      process.env.ANTHROPIC_MODEL ??
      process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ??
      process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ??
      process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ??
      DEFAULT_MODEL,
  )
  if (MODELS[resolved]) return resolved
  return resolved
}
