import type {
  ToolUseBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type {
  PermissionMode,
  ToolPermissionContext,
  PermissionResult,
} from './types/permissions.js'
import type {
  AssistantMessage,
  Message,
  SystemMessage,
} from './types/message.js'
import type {
  TypedTool,
  ToolConfig,
  ToolInputJSONSchema,
  ToolCategory,
  ToolExecutionMetadata,
  ToolExecutionHistoryEntry,
} from './types/tool.js'
import type { QueryChainTracking, AgentId } from './types/ids.js'
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
 * Aligned with full-version ToolUseContext — all new fields are optional (?)
 * for backward compatibility with existing tools.
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

  // ===== Full-version aligned fields (all optional) =====

  /** Current tool list (as readonly array, full-version compat) */
  tools?: Tools

  /** Session configuration options */
  options?: {
    commands?: unknown[]
    tools?: Tools
    mainLoopModel?: string
    verbose?: boolean
    mcpClients?: unknown[]
    mcpResources?: Record<string, unknown[]>
    debug?: boolean
  }

  /** Append a system message to the REPL message list */
  appendSystemMessage?: (msg: SystemMessage) => void

  /** Agent identity (set for subagents) */
  agentId?: AgentId
  /** Agent type name */
  agentType?: string

  /** Query chain tracking for subagent nesting */
  queryTracking?: QueryChainTracking

  /** MCP server connections */
  mcpClients?: unknown[]
  /** MCP server resources */
  mcpResources?: Record<string, unknown[]>

  /** Tool use ID for the current tool call */
  toolUseId?: string
}

/**
 * Result of a tool execution (existing compatible type).
 * All 47 built-in tools return this type.
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
 * Generic tool result aligned with full-version ToolResult<T>.
 * New tools should use this for type-safe outputs.
 */
export interface ToolResultV2<T = unknown> {
  /** Typed result data */
  data: T
  /** Whether execution succeeded */
  success: boolean
  /** Optional error message */
  error?: string
  /** Optional metadata */
  metadata?: Record<string, unknown>
  /** New messages to inject into conversation */
  newMessages?: (
    | import('./types/message.js').UserMessage
    | AssistantMessage
    | SystemMessage
  )[]
  /** Context modifier function */
  contextModifier?: (context: ToolUseContext) => ToolUseContext
  /** MCP protocol metadata */
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
}

/**
 * Convert ToolResult to ToolResultV2 for API compatibility
 */
export function toolResultToV2(result: ToolResult): ToolResultV2<string> {
  return {
    data: result.content,
    success: result.success,
    error: result.error,
    metadata: result.metadata,
  }
}

/**
 * Convert ToolResultV2 to ToolResult for backward compat
 */
export function toolResultV2ToContent(
  result: ToolResultV2<string>,
): ToolResult {
  return {
    content: result.data,
    success: result.success,
    error: result.error,
    metadata: result.metadata,
  }
}

/**
 * Result of tool input validation
 * Aligned with full-version ValidationResult
 */
export type ValidationResult =
  | { result: true }
  | { result: false; message: string; errorCode: number }

// ============================================================
// Tool interface — keep simple interface for existing tools,
// add full-version optional methods for future alignment
// ============================================================

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

  // ===== Concurrency & Safety (full-version aligned) =====

  /** Whether this tool is safe to run concurrently with others */
  isConcurrencySafe?(input: Record<string, unknown>): boolean
  /** Whether this tool only reads data (no side effects) */
  isReadOnly?(input: Record<string, unknown>): boolean
  /** Whether this tool can make destructive changes */
  isDestructive?(input: Record<string, unknown>): boolean

  /** Custom permission check beyond canUse */
  checkPermissions?(
    context: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<PermissionResult>

  /** Validate tool input before execution */
  validateInput?(
    input: Record<string, unknown>,
    context: ToolUseContext,
  ): Promise<ValidationResult>

  /** Max result size in chars before persisting to disk */
  maxResultSizeChars?: number

  // ===== MCP integration =====

  /** Whether this tool wraps an MCP server tool */
  isMcp?: boolean
  /** MCP server info for wrapped tools */
  mcpInfo?: { serverName: string; toolName: string }
}

/**
 * Tools collection type — readonly array (full-version compatible).
 * Internal code can still use Map<string, Tool> via toolsToMap().
 */
export type Tools = readonly Tool[]

/** Map of tool name to Tool (internal registry type) */
export type ToolMap = Map<string, Tool>

/**
 * Convert Tools (readonly array) to a lookup Map
 */
export function toolsToMap(tools: Tools): ToolMap {
  const map = new Map<string, Tool>()
  for (const tool of tools) map.set(tool.name, tool)
  return map
}

/**
 * Tool registry entry with metadata (local type for compatibility)
 */
export type ToolRegistryEntry = {
  tool: Tool
  enabled: boolean
  registrationTime: number
}

/**
 * Tool registry for managing multiple tools (local type for compatibility)
 */
export type ToolRegistry = Map<string, ToolRegistryEntry>

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
    isConcurrencySafe: config.isConcurrencySafe,
    isReadOnly: config.isReadOnly,
    isDestructive: config.isDestructive,
    checkPermissions: config.checkPermissions,
    validateInput: config.validateInput,
    maxResultSizeChars: config.maxResultSizeChars,
    isMcp: config.isMcp,
    mcpInfo: config.mcpInfo,
    searchHint: config.searchHint,
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
 * Find a tool by name (exact match or prefix match).
 * Accepts both Tools (readonly Tool[]) and Map<string, Tool> for backward compat.
 */
export function findToolByName(
  tools: Tools | Map<string, Tool>,
  name: string,
): Tool | undefined {
  // Map path
  if (tools instanceof Map) {
    let tool = tools.get(name)
    if (tool) return tool
    for (const [, t] of tools) {
      if (t.aliases?.includes(name)) return t
    }
    for (const [toolName, t] of tools) {
      if (toolName.startsWith(name)) return t
    }
    return undefined
  }

  // Readonly array path
  const exact = tools.find(t => t.name === name)
  if (exact) return exact

  // Check aliases
  for (const t of tools) {
    if (t.aliases?.includes(name)) return t
  }

  // Prefix match
  for (const t of tools) {
    if (t.name.startsWith(name)) return t
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
