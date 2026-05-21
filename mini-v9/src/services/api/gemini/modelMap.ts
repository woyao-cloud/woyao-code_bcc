export const GEMINI_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-20250514': 'gemini-2.0-flash',
  'claude-opus-4-20250514': 'gemini-2.5-pro-preview-03-25',
  'claude-haiku-3-5-20241022': 'gemini-2.0-flash-lite',
}

export function resolveGeminiModel(anthropicModel: string): string {
  const mapped = GEMINI_MODEL_MAP[anthropicModel]
  if (mapped) return mapped

  const explicit = process.env.GEMINI_MODEL
  if (explicit) return explicit

  return anthropicModel
}
