import type { Skill } from '../../services/skill/skillLoader.js'

export interface BundledPlugin {
  name: string
  version: string
  description: string
  skills: Skill[]
}

export function getBundledPlugins(): BundledPlugin[] {
  return []
}
