import type { Tool } from '../../../Tool.js'
import { CORE_TOOLS } from '../../../constants/tools.js'

export function isDeferredTool(tool: Tool): boolean {
  if (CORE_TOOLS.has(tool.name)) return false
  return true
}

export function formatDeferredToolLine(tool: Tool): string {
  const desc = tool.description ? ` — ${tool.description}` : ''
  return `  - ${tool.name}${desc}`
}

export function getPrompt(tools: Tool[]): string {
  const deferredList = tools
    .filter(t => isDeferredTool(t))
    .map(formatDeferredToolLine)
    .join('\n')

  const count = tools.filter(t => isDeferredTool(t)).length
  const coreCount = tools.filter(t => !isDeferredTool(t)).length

  return `You have ${coreCount} core tools always available (including this one), plus ${count} deferred tools that can be discovered when needed.

Use SearchExtraTools to discover deferred tools that match what you're trying to do. After discovery, call ExecuteExtraTool to invoke any discovered deferred tool.

Query formats:
- Keyword search: describe what you need, e.g. "schedule cron job"
- Direct select: "select:CronCreate,CronList" to pick specific tools by name
- Discovery: "discover:task management" for pure discovery without execution

Note: Core tools (listed in your tool list) are called directly. Only use ExecuteExtraTool for tools found via SearchExtraTools.`

  // (deferred tools listing is generated dynamically at call time)
}
