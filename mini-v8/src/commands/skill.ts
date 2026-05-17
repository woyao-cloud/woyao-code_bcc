import type { CommandContext } from './registry.js'
import { registerCommand } from './registry.js'
import {
  handleSkillSearchCommand,
  handleSkillStoreCommand,
  isSkillSearchEnabled,
  searchLocalSkills,
} from './skillCommands.js'
import { discoverSkills } from '../services/skill/skillLoader.js'

export function registerSkillCommand(): void {
  registerCommand({
    name: 'skill',
    description: 'Skill discovery and management',
    usage: '/skill <list|view|search> [name|query]',
    handler: (ctx: CommandContext) => {
      const subArgs = ctx.args
      let result: string

      if (subArgs.startsWith('search')) {
        const query = subArgs.slice('search'.length).trim()
        if (isSkillSearchEnabled()) {
          const allSkills = discoverSkills(ctx.cwd)
          const found = searchLocalSkills(allSkills, query)
          result =
            found.length === 0
              ? 'No matching skills found.'
              : `Skills matching "${query}":\n` +
                found.map(s => `  ${s.name} (${s.source})`).join('\n')
        } else {
          result = 'Skill search is not enabled.'
        }
      } else {
        result = handleSkillSearchCommand(subArgs)
      }

      return result
    },
  })
}
