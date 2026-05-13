import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import { discoverSkills } from '../../../services/skill/skillLoader.js'
import { getCwd } from '../../../bootstrap/state.js'

export const SkillTool: Tool = {
  name: 'Skill',
  description:
    'Load and view available skills from the project. Skills provide specialized instructions for specific tasks.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: ['list', 'view'],
        description:
          'Command: "list" to list skills, "view" to view a specific skill',
      },
      name: { type: 'string', description: 'Skill name (for "view" command)' },
    },
    required: ['command'],
  },
  prompt: 'Skill tool: discover and view project skills.',

  async execute(
    ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const command = String(input.command ?? '').trim()
    const name = input.name ? String(input.name).trim() : undefined
    const root = ctx.cwd || getCwd()

    const skills = discoverSkills(root)

    if (command === 'list') {
      if (skills.length === 0) {
        return { content: 'No skills found.', success: true }
      }
      const skillList = skills.map(s => `- ${s.name}: ${s.path}`).join('\n')
      return {
        content: `${skills.length} skill(s) found:\n${skillList}`,
        success: true,
      }
    }

    if (command === 'view') {
      if (!name) {
        return {
          content: 'Skill name required for "view" command',
          success: false,
          error: 'Missing name',
        }
      }
      const skill = skills.find(s => s.name === name)
      if (!skill) {
        return {
          content: `Skill not found: ${name}`,
          success: false,
          error: 'Not found',
        }
      }
      return {
        content: `Skill: ${skill.name}\nPath: ${skill.path}\n\n${skill.content}`,
        success: true,
      }
    }

    return {
      content: `Unknown command: ${command}. Use "list" or "view".`,
      success: false,
      error: 'Unknown command',
    }
  },

  userFacingName: () => 'Skill',
}
