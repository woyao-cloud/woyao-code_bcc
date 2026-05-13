import type { Tool, Tools } from '../Tool.js'
import { BashTool } from './builtin/BashTool/BashTool.js'
import { FileReadTool } from './builtin/FileReadTool/FileReadTool.js'
import { FileWriteTool } from './builtin/FileWriteTool/FileWriteTool.js'
import { FileEditTool } from './builtin/FileEditTool/FileEditTool.js'
import { GrepTool } from './builtin/GrepTool/GrepTool.js'
import { GlobTool } from './builtin/GlobTool/GlobTool.js'
import { WebFetchTool } from './builtin/WebFetchTool/WebFetchTool.js'
import { WebSearchTool } from './builtin/WebSearchTool/WebSearchTool.js'

export function getTools(): Tool[] {
  return [
    BashTool,
    FileReadTool,
    FileWriteTool,
    FileEditTool,
    GrepTool,
    GlobTool,
    WebFetchTool,
    WebSearchTool,
  ]
}

export function getToolsMap(): Tools {
  const map = new Map<string, Tool>()
  for (const tool of getTools()) map.set(tool.name, tool)
  return map
}
