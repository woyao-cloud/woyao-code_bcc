import type {
  ToolUseBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type {
  PermissionMode,
  ToolPermissionContext,
  PermissionResult,
} from './types/permissions.js'
import type { AssistantMessage, Message } from './types/message.js'

// ============================================================
// Core Tool interface for mini CLI
// ============================================================

/**
 * JSON Schema for tool input validation
 */
export type ToolInputSchema = {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

/**
 * Context passed to tool during execution
 */
export interface ToolUseContext {
  /** The tool use block being executed */
  toolUse: ToolUseBlockParam
  /** Current permission mode */
  permissionMode: PermissionMode
  /** Permission context for this tool */
  toolPermissionContext: ToolPermissionContext
  /** Current working directory */
  cwd: string
  /** Abort signal for cancellation */
  abortSignal: AbortSignal
  /** All messages in current conversation */
  messages: Message[]
  /** Whether running in interactive mode */
  isInteractive: boolean
}

/**
 * Result of a tool execution
 */
export interface ToolResult {
  /** Content to send back to the model */
  content: string
  /** Optional rendered output for display */
  rendered?: string
  /** Whether the tool execution succeeded */
  success: boolean
  /** Optional error message */
  error?: string
  /** Optional metadata for the result */
  metadata?: Record<string, unknown>
}

/**
 * A Tool that can be invoked by the model
 */
export interface Tool {
  /** Unique name for the tool */
  name: string
  /** Human-readable description for the model */
  description: string
  /** Input JSON schema for validation */
  inputSchema: ToolInputSchema
  /** Human-readable prompt that describes how to use the tool */
  prompt: string
  /**
   * Execute the tool with given input.
   * Returns the result to send back to the model.
   */
  execute(
    context: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult>
  /**
   * Check if the tool can be used (permission check).
   * Returns 'allow' or 'deny'.
   */
  canUse?(
    context: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<PermissionResult>
  /**
   * Get the user-facing tool name for display.
   */
  userFacingName?(): string
}

/** Map of tool name to Tool */
export type Tools = Map<string, Tool>

/**
 * Find a tool by name (exact match or prefix match)
 */
export function findToolByName(tools: Tools, name: string): Tool | undefined {
  return tools.get(name)
}

/**
 * Check if a tool name matches the given name or alias
 */
export function toolMatchesName(tool: Tool, name: string): boolean {
  return tool.name === name
}

/**
 * Convert a Tool to its API schema representation
 */
export function toolToAPISchema(tool: Tool): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }
}
