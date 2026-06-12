import type { Tool } from '../../Tool.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolExecutionHooks,
} from './toolExecution.js'
import {
  checkToolPermission,
  buildToolContext,
  executeSingleTool,
  formatToolErrorResult,
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
    hooks?: ToolExecutionHooks
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

function isReadOnly(toolUse: OrchestratedToolUse): boolean {
  return (
    toolUse.tool.isReadOnly?.(toolUse.request.input) ??
    CONCURRENT_SAFE_TOOLS.has(toolUse.request.name)
  )
}

function isDestructive(toolUse: OrchestratedToolUse): boolean {
  return toolUse.tool.isDestructive?.(toolUse.request.input) ?? false
}

function partitionTools(tools: OrchestratedToolUse[]): {
  concurrent: OrchestratedToolUse[]
  serial: OrchestratedToolUse[]
} {
  const concurrent: OrchestratedToolUse[] = []
  const serial: OrchestratedToolUse[] = []

  for (const t of tools) {
    if (isConcurrencySafe(t) || isReadOnly(t)) {
      concurrent.push(t)
    } else {
      serial.push(t)
    }
  }

  return { concurrent, serial }
}

/**
 * Combine two AbortSignals into a single signal.
 * If either signal aborts, the combined signal aborts.
 */
function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController()
  for (const signal of signals) {
    if (!signal) continue
    if (signal.aborted) {
      controller.abort(signal.reason)
      return controller.signal
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
    })
  }
  return controller.signal
}

/**
 * Execute tools using a slot-based concurrent queue.
 * When a destructive tool (e.g., Bash) errors, remaining in-flight
 * concurrent siblings are cancelled to prevent cascading failures.
 * Slot-level abort signals are propagated to tool execution contexts
 * so running tools can detect cancellation.
 */
async function runConcurrentWithSlots(
  tools: OrchestratedToolUse[],
  maxSlots: number,
  hooks?: ToolExecutionHooks,
): Promise<{ toolResults: ContentItem[]; results: ToolExecutionResult[] }> {
  const toolResults: ContentItem[] = []
  const results: ToolExecutionResult[] = []
  let index = 0
  let errorCascaded = false
  const cascadeAbortController = new AbortController()

  async function workSlot(): Promise<void> {
    while (index < tools.length && !errorCascaded) {
      const slot = index++
      const t = tools[slot]

      // Merge the cascade abort signal into the tool context so running tools
      // can detect cancellation when a destructive sibling fails.
      const mergedSignal = combineSignals(
        t.ctx.abortSignal,
        cascadeAbortController.signal,
      )
      const ctxWithSlotAbort = { ...t.ctx, abortSignal: mergedSignal }

      const r = await executeSingleTool(
        t.tool,
        t.request,
        ctxWithSlotAbort,
        hooks,
      )
      toolResults.push(r.toolResult)
      results.push(r)

      // Cascade: if a destructive tool errors, cancel siblings
      if (!r.success && isDestructive(t)) {
        errorCascaded = true
        cascadeAbortController.abort()
      }
    }
  }

  const workers: Promise<void>[] = []
  const slotCount = Math.min(maxSlots, tools.length)
  for (let i = 0; i < slotCount; i++) {
    workers.push(workSlot())
  }
  await Promise.all(workers)

  // Mark remaining tools as cancelled (if error cascaded)
  if (errorCascaded) {
    while (index < tools.length) {
      const t = tools[index++]
      const msg = 'Cancelled due to sibling tool error'
      const errorResult = formatToolErrorResult(t.request, msg)
      toolResults.push(errorResult.toolResult)
      results.push(errorResult)
    }
  }

  return { toolResults, results }
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
    hooks?: ToolExecutionHooks
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

  const hooks = options?.hooks

  if (concurrent.length > 0) {
    const { toolResults: cr, results: r } = await runConcurrentWithSlots(
      concurrent,
      MAX_CONCURRENCY,
      hooks,
    )
    toolResults.push(...cr)
    allResults.push(...r)
  }

  for (const t of serial) {
    const r = await executeSingleTool(t.tool, t.request, t.ctx, hooks)
    toolResults.push(r.toolResult)
    allResults.push(r)
  }

  return { toolResults, results: allResults }
}
