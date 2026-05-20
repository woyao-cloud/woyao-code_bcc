import type { Tool, Tools } from '../Tool.js'
import { BashTool } from './builtin/BashTool/BashTool.js'
import { FileReadTool } from './builtin/FileReadTool/FileReadTool.js'
import { FileWriteTool } from './builtin/FileWriteTool/FileWriteTool.js'
import { FileEditTool } from './builtin/FileEditTool/FileEditTool.js'
import { GrepTool } from './builtin/GrepTool/GrepTool.js'
import { GlobTool } from './builtin/GlobTool/GlobTool.js'
import { WebFetchTool } from './builtin/WebFetchTool/WebFetchTool.js'
import { WebSearchTool } from './builtin/WebSearchTool/WebSearchTool.js'
import { TaskCreateTool } from './builtin/TaskCreateTool/TaskCreateTool.js'
import { TaskUpdateTool } from './builtin/TaskUpdateTool/TaskUpdateTool.js'
import { TaskListTool } from './builtin/TaskListTool/TaskListTool.js'
import { ApplyPatchTool } from './builtin/ApplyPatchTool/ApplyPatchTool.js'
import { SkillTool } from './builtin/SkillTool/SkillTool.js'
import { EnterPlanModeTool } from './builtin/EnterPlanModeTool/EnterPlanModeTool.js'
import { ExitPlanModeTool } from './builtin/ExitPlanModeTool/ExitPlanModeTool.js'
import { AgentTool } from './builtin/AgentTool/AgentTool.js'
import { TeamCreateTool } from './builtin/TeamCreateTool/TeamCreateTool.js'
import { TeamDeleteTool } from './builtin/TeamDeleteTool/TeamDeleteTool.js'
import { TaskGetTool } from './builtin/TaskGetTool/TaskGetTool.js'
import { TaskOutputTool } from './builtin/TaskOutputTool/TaskOutputTool.js'
import { TaskStopTool } from './builtin/TaskStopTool/TaskStopTool.js'
import { TodoWriteTool } from './builtin/TodoWriteTool/TodoWriteTool.js'
import { AskUserQuestionTool } from './builtin/AskUserQuestionTool/AskUserQuestionTool.js'
import { SleepTool } from './builtin/SleepTool/SleepTool.js'
import { ConfigTool } from './builtin/ConfigTool/ConfigTool.js'
import { PowerShellTool } from './builtin/PowerShellTool/PowerShellTool.js'
import { SendUserFileTool } from './builtin/SendUserFileTool/SendUserFileTool.js'
import { VerifyPlanExecutionTool } from './builtin/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js'
import { SendMessageTool } from './builtin/SendMessageTool/SendMessageTool.js'
import { BriefTool } from './builtin/BriefTool/BriefTool.js'
import { NotebookEditTool } from './builtin/NotebookEditTool/NotebookEditTool.js'
import { LSPTool } from './builtin/LSPTool/LSPTool.js'
import { WebBrowserTool } from './builtin/WebBrowserTool/WebBrowserTool.js'
import { CronCreateTool } from './builtin/CronCreateTool/CronCreateTool.js'
import { CronDeleteTool } from './builtin/CronDeleteTool/CronDeleteTool.js'
import { CronListTool } from './builtin/CronListTool/CronListTool.js'
import {
  SearchExtraToolsTool,
  setToolListProvider,
} from './builtin/SearchExtraToolsTool/SearchExtraToolsTool.js'
import {
  ExecuteTool,
  setExecuteToolListProvider,
} from './builtin/ExecuteTool/ExecuteTool.js'
import { SyntheticOutputTool } from './builtin/SyntheticOutputTool/SyntheticOutputTool.js'
import { createMCPToolWrapper } from './builtin/MCPTool/MCPTool.js'
import type { MCPEntry } from '../services/mcp/mcpClient.js'
import { isDeferredTool } from './builtin/SearchExtraToolsTool/prompt.js'

let mcpTools: Tool[] = []

export function registerMCPTools(entries: MCPEntry[]): void {
  mcpTools = []
  for (const entry of entries) {
    for (const tool of entry.tools) {
      mcpTools.push(createMCPToolWrapper(entry, tool))
    }
  }
}

/**
 * Single source of truth for all built-in tool definitions.
 */
export function getAllBaseTools(): Tool[] {
  return [
    BashTool,
    FileReadTool,
    FileWriteTool,
    FileEditTool,
    GrepTool,
    GlobTool,
    WebFetchTool,
    WebSearchTool,
    TaskCreateTool,
    TaskUpdateTool,
    TaskListTool,
    ApplyPatchTool,
    SkillTool,
    EnterPlanModeTool,
    ExitPlanModeTool,
    AgentTool,
    TeamCreateTool,
    TeamDeleteTool,
    TaskGetTool,
    TaskOutputTool,
    TaskStopTool,
    TodoWriteTool,
    AskUserQuestionTool,
    SleepTool,
    ConfigTool,
    PowerShellTool,
    SendUserFileTool,
    VerifyPlanExecutionTool,
    SendMessageTool,
    BriefTool,
    NotebookEditTool,
    LSPTool,
    WebBrowserTool,
    CronCreateTool,
    CronDeleteTool,
    CronListTool,
    // Deferred tool discovery
    SearchExtraToolsTool,
    ExecuteTool,
    SyntheticOutputTool,
  ]
}

export function getTools(): Tool[] {
  return [...getAllBaseTools(), ...mcpTools]
}

export function getDeferredTools(): Tool[] {
  return getTools().filter(t => isDeferredTool(t))
}

// Wire up tool list providers for SearchExtraToolsTool and ExecuteTool.
// These tools need access to the full tool list at execution time,
// so we use a provider pattern to avoid circular imports.
setToolListProvider(() => getTools())
setExecuteToolListProvider(() => getTools())

export function getToolsMap(): Tools {
  const map = new Map<string, Tool>()
  for (const tool of getTools()) map.set(tool.name, tool)
  return map
}

/**
 * Merge built-in tools with MCP tools into a single tool pool.
 * Built-in tools take precedence on name conflicts.
 * Tools are sorted by name for prompt-cache stability.
 */
export function assembleToolPool(mcpToolsInput?: Tool[]): Tool[] {
  const builtIn = getAllBaseTools()
  const external = mcpToolsInput ?? mcpTools

  if (external.length === 0) {
    return [...builtIn].sort(byName)
  }

  const seen = new Set<string>()
  const merged: Tool[] = []

  for (const tool of [...builtIn, ...external]) {
    if (!seen.has(tool.name)) {
      seen.add(tool.name)
      merged.push(tool)
    }
  }

  return merged.sort(byName)
}

function byName(a: Tool, b: Tool): number {
  return a.name.localeCompare(b.name)
}
