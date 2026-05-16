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
): Promise<ToolExecutionResult> {
  const result: ToolResult = await tool.execute(ctx, request.input)
  const content = persistLargeToolResult(result.content)

  return {
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
}
