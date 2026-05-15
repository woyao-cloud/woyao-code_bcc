/**
 * Model name mapping for OpenAI-compatible providers.
 * Maps Anthropic model names to OpenAI equivalents.
 */

export const OPENAI_MODEL_MAP: Record<string, string> = {
  // Anthropic -> OpenAI equivalents
  'claude-sonnet-4-20250514': 'gpt-4o',
  'claude-opus-4-20250514': 'gpt-4o',
  // OpenAI native models (pass through)
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-4-turbo': 'gpt-4-turbo',
  'gpt-3.5-turbo': 'gpt-3.5-turbo',
  o1: 'o1',
  'o3-mini': 'o3-mini',
  // Qwen models (pass through)
  'qwen-max': 'qwen-max',
  'qwen-plus': 'qwen-plus',
  'qwen-turbo': 'qwen-turbo',
  'qwen-coder-plus': 'qwen-coder-plus',
}

/**
 * Resolve model name for OpenAI-compatible APIs.
 * Passes through unknown models as-is (supports custom models like deepseek-v4, kimi-k2.5, qwen, etc.)
 */
export function resolveOpenAIModel(anthropicModel: string): string {
  return OPENAI_MODEL_MAP[anthropicModel] || anthropicModel
}

export const OPENAI_DEFAULT_MODEL = 'gpt-4o'
