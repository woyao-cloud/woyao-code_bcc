import type { Skill } from './skillLoader.js'

export interface MCPSkillConfig {
  serverName: string
  toolName: string
  description: string
  prompt?: string
}

export function buildSkillFromMCPTool(config: MCPSkillConfig): Skill {
  return {
    name: `mcp-${config.serverName}-${config.toolName}`,
    path: `mcp:${config.serverName}/${config.toolName}`,
    content:
      config.prompt ??
      `Use the MCP tool ${config.toolName} from server ${config.serverName}.\n\n${config.description}`,
    source: 'plugin',
  }
}

export function buildMCPSkills(configs: MCPSkillConfig[]): Skill[] {
  return configs.map(buildSkillFromMCPTool)
}
