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
import type {
  TypedTool,
  ToolConfig,
  ToolInputJSONSchema,
  ToolCategory,
  ToolRegistry,
  ToolRegistryEntry,
  ToolExecutionMetadata,
  ToolExecutionHistoryEntry,
} from './types/tool.js'
import { randomUUID } from './utils/crypto.js'

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
  /** Tool aliases for alternative names */
  aliases?: string[]
  /** Whether tool requires user confirmation */
  requiresConfirmation?: boolean
  /** Tool category for organization */
  category?: ToolCategory
  /** Whether tool is deprecated */
  deprecated?: boolean
  /** Deprecation message if applicable */
  deprecationMessage?: string
}

/** Map of tool name to Tool */
export type Tools = Map<string, Tool>

// ============================================================
// Tool Factory
// ============================================================

/**
 * Build a tool with safe defaults and type safety
 * @param config Tool configuration
 * @returns A typed tool instance
 */
export function buildTool<Input = Record<string, unknown>, Output = ToolResult>(
  config: ToolConfig<Input, Output>,
): TypedTool<Input, Output> {
  // Validate required fields
  if (!config.name || !config.name.trim()) {
    throw new Error('Tool name is required')
  }
  if (!config.description || !config.description.trim()) {
    throw new Error('Tool description is required')
  }
  if (!config.inputSchema) {
    throw new Error('Tool inputSchema is required')
  }
  if (!config.execute || typeof config.execute !== 'function') {
    throw new Error('Tool execute function is required')
  }

  // Set default values
  const tool: TypedTool<Input, Output> = {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    prompt: config.prompt,
    execute: config.execute,
    canUse: config.canUse,
    userFacingName: config.userFacingName,
    aliases: config.aliases || [],
    requiresConfirmation: config.requiresConfirmation || false,
    category: config.category || 'other',
    deprecated: config.deprecated || false,
    deprecationMessage: config.deprecationMessage,
  }

  return tool
}

/**
 * Build a tool that converts to standard ToolResult
 * @param config Tool configuration
 * @returns A tool that returns ToolResult
 */
export function buildStandardTool(
  config: Omit<ToolConfig<Record<string, unknown>, ToolResult>, 'execute'> & {
    execute: (
      context: ToolUseContext,
      input: Record<string, unknown>,
    ) => Promise<ToolResult>
  },
): Tool {
  return buildTool(config) as unknown as Tool
}

// ============================================================
// Tool Registry
// ============================================================

let globalRegistry: ToolRegistry = new Map()
let executionHistory: ToolExecutionHistoryEntry[] = []
const MAX_HISTORY_SIZE = 100

/**
 * Get the global tool registry
 */
export function getToolRegistry(): ToolRegistry {
  return globalRegistry
}

/**
 * Register a tool in the global registry
 */
export function registerTool(tool: Tool, enabled: boolean = true): void {
  globalRegistry.set(tool.name, {
    tool,
    enabled,
    registrationTime: Date.now(),
  })

  // Register aliases
  if (tool.aliases) {
    for (const alias of tool.aliases) {
      globalRegistry.set(alias, {
        tool,
        enabled,
        registrationTime: Date.now(),
      })
    }
  }
}

/**
 * Unregister a tool from the global registry
 */
export function unregisterTool(toolName: string): void {
  const entry = globalRegistry.get(toolName)
  if (entry) {
    // Unregister main tool
    globalRegistry.delete(toolName)
    // Unregister aliases
    for (const [name, regEntry] of globalRegistry.entries()) {
      if (regEntry.tool.name === entry.tool.name && name !== toolName) {
        globalRegistry.delete(name)
      }
    }
  }
}

/**
 * Get all registered tools
 */
export function getRegisteredTools(includeDisabled: boolean = false): Tool[] {
  const tools: Tool[] = []
  const seen = new Set<string>()

  for (const entry of globalRegistry.values()) {
    if (!seen.has(entry.tool.name)) {
      seen.add(entry.tool.name)
      if (includeDisabled || entry.enabled) {
        tools.push(entry.tool)
      }
    }
  }

  return tools
}

/**
 * Get a registered tool by name
 */
export function getRegisteredTool(name: string): Tool | undefined {
  const entry = globalRegistry.get(name)
  return entry && entry.enabled ? entry.tool : undefined
}

/**
 * Enable/disable a tool
 */
export function setToolEnabled(toolName: string, enabled: boolean): void {
  const entry = globalRegistry.get(toolName)
  if (entry) {
    entry.enabled = enabled
  }
}

/**
 * Clear the tool registry (for testing)
 */
export function clearToolRegistry(): void {
  globalRegistry = new Map()
}

// ============================================================
// Tool Execution History
// ============================================================

/**
 * Record a tool execution
 */
export function recordToolExecution(
  metadata: Omit<ToolExecutionHistoryEntry, 'id' | 'timestamp'>,
): void {
  const entry: ToolExecutionHistoryEntry = {
    ...metadata,
    id: randomUUID(),
    timestamp: Date.now(),
  }

  executionHistory.push(entry)

  // Trim history
  if (executionHistory.length > MAX_HISTORY_SIZE) {
    executionHistory = executionHistory.slice(-MAX_HISTORY_SIZE)
  }
}

/**
 * Get tool execution history
 */
export function getToolExecutionHistory(
  limit: number = MAX_HISTORY_SIZE,
): ToolExecutionHistoryEntry[] {
  return executionHistory.slice(-limit)
}

/**
 * Clear execution history (for testing)
 */
export function clearExecutionHistory(): void {
  executionHistory = []
}

// ============================================================
// Tool Helpers
// ============================================================

/**
 * Find a tool by name (exact match or prefix match)
 */
export function findToolByName(tools: Tools, name: string): Tool | undefined {
  let tool = tools.get(name)
  if (tool) return tool

  // Check aliases
  for (const [toolName, t] of tools.entries()) {
    if (t.aliases?.includes(name)) {
      return t
    }
  }

  // Prefix match
  for (const [toolName, t] of tools.entries()) {
    if (toolName.startsWith(name)) {
      return t
    }
  }

  return undefined
}

/**
 * Check if a tool name matches the given name or alias
 */
export function toolMatchesName(tool: Tool, name: string): boolean {
  if (tool.name === name) return true
  if (tool.aliases?.includes(name)) return true
  return false
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

/**
 * Get tools grouped by category
 */
export function getToolsByCategory(tools: Tool[]): Map<ToolCategory, Tool[]> {
  const grouped = new Map<ToolCategory, Tool[]>()

  for (const tool of tools) {
    const category = tool.category || 'other'
    const categoryTools = grouped.get(category) || []
    categoryTools.push(tool)
    grouped.set(category, categoryTools)
  }

  return grouped
}

/**
 * Create a success tool result
 */
export function createSuccessResult(
  content: string,
  metadata?: Record<string, unknown>,
): ToolResult {
  return {
    content,
    success: true,
    metadata,
  }
}

/**
 * Create an error tool result
 */
export function createErrorResult(
  error: string,
  content?: string,
  metadata?: Record<string, unknown>,
): ToolResult {
  return {
    content: content || `Error: ${error}`,
    success: false,
    error,
    metadata,
  }
}
