import type { Tool, ToolUseContext, ToolResult } from '../../Tool.js'
import type { ContentItem } from '../../types/message.js'
import { getPermissionMode } from '../../utils/settings/settings.js'
import { requestPermission } from '../permission/permissionManager.js'
import { persistLargeToolResult } from '../toolResultStorage.js'

export interface ToolExecutionRequest {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolExecutionResult {
  id: string
  name: string
  toolResult: ContentItem
  success: boolean
  content: string
  error?: string
}

export interface ToolExecutionHooks {
  onBeforeExecute?: (id: string, name: string) => void
  onAfterExecute?: (
    id: string,
    name: string,
    result: ToolExecutionResult,
  ) => void
  onError?: (id: string, name: string, error: Error) => void
}

export interface BuildToolContextOptions {
  abortSignal?: AbortSignal
  isInteractive?: boolean
}

export function buildToolContext(
  toolUse: ToolExecutionRequest,
  cwd: string,
  options?: BuildToolContextOptions,
): ToolUseContext {
  return {
    toolUse: {
      type: 'tool_use',
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    },
    permissionMode: getPermissionMode(cwd) as 'default',
    toolPermissionContext: {
      mode: 'default',
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      isBypassPermissionsModeAvailable: false,
    },
    cwd,
    abortSignal: options?.abortSignal ?? new AbortController().signal,
    messages: [],
    isInteractive: options?.isInteractive ?? true,
  }
}

export async function checkToolPermission(
  tool: Tool,
  input: Record<string, unknown>,
  override?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => Promise<boolean>,
): Promise<boolean> {
  if (override) {
    return override(tool.name, input)
  }
  return requestPermission({
    toolName: tool.name,
    toolDescription: tool.description,
    input,
  })
}

export async function executeSingleTool(
  tool: Tool,
  request: ToolExecutionRequest,
  ctx: ToolUseContext,
  hooks?: ToolExecutionHooks,
): Promise<ToolExecutionResult> {
  hooks?.onBeforeExecute?.(request.id, request.name)
  try {
    const result: ToolResult = await tool.execute(ctx, request.input)
    const content = persistLargeToolResult(result.content)

    const execResult: ToolExecutionResult = {
      id: request.id,
      name: request.name,
      success: result.success,
      content,
      error: result.error,
      toolResult: {
        type: 'tool_result',
        tool_use_id: request.id,
        content,
        is_error: !result.success,
      },
    }
    hooks?.onAfterExecute?.(request.id, request.name, execResult)
    return execResult
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    hooks?.onError?.(request.id, request.name, error)
    throw error
  }
}

/**
 * Format a tool error result for cases where tool execution can't proceed
 * (unknown tool, permission denied, cancelled).
 */
export function formatToolErrorResult(
  request: ToolExecutionRequest,
  errorMsg: string,
): ToolExecutionResult {
  return {
    id: request.id,
    name: request.name,
    success: false,
    content: errorMsg,
    error: errorMsg,
    toolResult: {
      type: 'tool_result',
      tool_use_id: request.id,
      content: errorMsg,
      is_error: true,
    },
  }
}
