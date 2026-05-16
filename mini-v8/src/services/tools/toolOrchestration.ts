import type { Tool } from '../../Tool.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  ToolExecutionRequest,
  ToolExecutionResult,
} from './toolExecution.js'
import {
  checkToolPermission,
  buildToolContext,
  executeSingleTool,
} from './toolExecution.js'
import type { ContentItem } from '../../types/message.js'

export const CONCURRENT_SAFE_TOOLS = new Set([
  'Grep',
  'Glob',
  'Read',
  'WebFetch',
  'WebSearch',
])

const MAX_CONCURRENCY = 5

export interface OrchestratedToolUse {
  request: ToolExecutionRequest
  tool: Tool
  ctx: ToolUseContext
}

export interface OrchestrationResult {
  toolResults: ContentItem[]
  results: ToolExecutionResult[]
}

export async function buildOrchestratedToolUses(
  toolUses: ToolExecutionRequest[],
  toolsMap: Map<string, Tool>,
  cwd: string,
  options?: {
    canUseTool?: (
      name: string,
      input: Record<string, unknown>,
    ) => Promise<boolean>
    abortSignal?: AbortSignal
    isInteractive?: boolean
  },
): Promise<{
  tools: OrchestratedToolUse[]
  unknownTools: Array<{ request: ToolExecutionRequest; error: string }>
  deniedTools: Array<{ request: ToolExecutionRequest; error: string }>
}> {
  const tools: OrchestratedToolUse[] = []
  const unknownTools: Array<{ request: ToolExecutionRequest; error: string }> =
    []
  const deniedTools: Array<{ request: ToolExecutionRequest; error: string }> =
    []

  for (const t of toolUses) {
    const tool = toolsMap.get(t.name)
    if (!tool) {
      unknownTools.push({ request: t, error: `Unknown tool: ${t.name}` })
      continue
    }

    const allowed = await checkToolPermission(
      tool,
      t.input,
      options?.canUseTool,
    )
    if (!allowed) {
      deniedTools.push({ request: t, error: 'Permission denied.' })
      continue
    }

    const ctx = buildToolContext(t, cwd, {
      abortSignal: options?.abortSignal,
      isInteractive: options?.isInteractive,
    })

    tools.push({ request: t, tool, ctx })
  }

  return { tools, unknownTools, deniedTools }
}

function isConcurrencySafe(toolUse: OrchestratedToolUse): boolean {
  return (
    toolUse.tool.isConcurrencySafe?.(toolUse.request.input) ??
    CONCURRENT_SAFE_TOOLS.has(toolUse.request.name)
  )
}

function partitionTools(tools: OrchestratedToolUse[]): {
  concurrent: OrchestratedToolUse[]
  serial: OrchestratedToolUse[]
} {
  const concurrent: OrchestratedToolUse[] = []
  const serial: OrchestratedToolUse[] = []

  for (const t of tools) {
    if (isConcurrencySafe(t)) {
      concurrent.push(t)
    } else {
      serial.push(t)
    }
  }

  return { concurrent, serial }
}

export async function orchestrateToolExecution(
  toolUses: ToolExecutionRequest[],
  toolsMap: Map<string, Tool>,
  cwd: string,
  options?: {
    canUseTool?: (
      name: string,
      input: Record<string, unknown>,
    ) => Promise<boolean>
    abortSignal?: AbortSignal
    isInteractive?: boolean
  },
): Promise<OrchestrationResult> {
  const { tools, unknownTools, deniedTools } = await buildOrchestratedToolUses(
    toolUses,
    toolsMap,
    cwd,
    options,
  )

  const allResults: ToolExecutionResult[] = []
  const toolResults: ContentItem[] = []

  for (const t of unknownTools) {
    toolResults.push({
      type: 'tool_result',
      tool_use_id: t.request.id,
      content: t.error,
      is_error: true,
    })
    allResults.push({
      id: t.request.id,
      name: t.request.name,
      success: false,
      content: t.error,
      error: t.error,
      toolResult: toolResults[toolResults.length - 1],
    })
  }
  for (const t of deniedTools) {
    toolResults.push({
      type: 'tool_result',
      tool_use_id: t.request.id,
      content: 'Permission denied.',
      is_error: true,
    })
    allResults.push({
      id: t.request.id,
      name: t.request.name,
      success: false,
      content: 'Permission denied.',
      error: 'Permission denied.',
      toolResult: toolResults[toolResults.length - 1],
    })
  }

  const { concurrent, serial } = partitionTools(tools)

  // Execute concurrent batch
  for (let i = 0; i < concurrent.length; i += MAX_CONCURRENCY) {
    const batch = concurrent.slice(i, i + MAX_CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(t => executeSingleTool(t.tool, t.request, t.ctx)),
    )
    for (const r of batchResults) {
      toolResults.push(r.toolResult)
      allResults.push(r)
    }
  }

  // Execute serial batch
  for (const t of serial) {
    const r = await executeSingleTool(t.tool, t.request, t.ctx)
    toolResults.push(r.toolResult)
    allResults.push(r)
  }

  return { toolResults, results: allResults }
}
