/**
 * Enhanced tool type definitions for mini-v8
 * Extracted and simplified from full version
 */

import type { ToolPermissionContext, PermissionResult } from './permissions.js'

// ============================================================================
// Tool Input Schema
// ============================================================================

/**
 * JSON Schema for tool input validation with strict typing
 */
export type ToolInputJSONSchema = {
  type: 'object'
  properties: Record<string, ToolInputJSONSchemaProperty>
  required?: string[]
  description?: string
  additionalProperties?: boolean
}

/**
 * Property definition for tool input schema
 */
export type ToolInputJSONSchemaProperty = {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'integer'
  description?: string
  enum?: string[]
  default?: unknown
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  items?: ToolInputJSONSchemaProperty
  properties?: Record<string, ToolInputJSONSchemaProperty>
  required?: string[]
}

// ============================================================================
// Tool Configuration
// ============================================================================

/**
 * Tool configuration options for buildTool
 */
export type ToolConfig<Input, Output> = {
  name: string
  description: string
  inputSchema: ToolInputJSONSchema
  prompt: string
  execute: (context: any, input: Input) => Promise<Output>
  canUse?: (context: any, input: Input) => Promise<PermissionResult>
  userFacingName?: () => string
  aliases?: string[]
  requiresConfirmation?: boolean
  category?: ToolCategory
  deprecated?: boolean
  deprecationMessage?: string
  isConcurrencySafe?: (input: Input) => boolean
  isReadOnly?: (input: Input) => boolean
  isDestructive?: (input: Input) => boolean
  checkPermissions?: (context: any, input: Input) => Promise<PermissionResult>
  validateInput?: (
    input: Input,
    context: any,
  ) => Promise<{ valid: boolean; error?: string }>
  maxResultSizeChars?: number
  isMcp?: boolean
  mcpInfo?: { serverName: string; toolName: string }
  searchHint?: string
}

/**
 * Tool categories for organization
 */
export type ToolCategory =
  | 'file'
  | 'search'
  | 'git'
  | 'agent'
  | 'memory'
  | 'skill'
  | 'web'
  | 'mcp'
  | 'other'

// ============================================================================
// Typed Tool Interface
// ============================================================================

/**
 * Enhanced Tool interface with type safety
 */
export interface TypedTool<Input = Record<string, unknown>, Output = any> {
  name: string
  description: string
  inputSchema: ToolInputJSONSchema
  prompt: string
  execute: (context: any, input: Input) => Promise<Output>
  canUse?: (context: any, input: Input) => Promise<PermissionResult>
  userFacingName?: () => string
  aliases?: string[]
  requiresConfirmation?: boolean
  category?: ToolCategory
  deprecated?: boolean
  deprecationMessage?: string
  isConcurrencySafe?: (input: Input) => boolean
  isReadOnly?: (input: Input) => boolean
  isDestructive?: (input: Input) => boolean
  checkPermissions?: (context: any, input: Input) => Promise<PermissionResult>
  validateInput?: (
    input: Input,
    context: any,
  ) => Promise<{ valid: boolean; error?: string }>
  maxResultSizeChars?: number
  isMcp?: boolean
  mcpInfo?: { serverName: string; toolName: string }
  searchHint?: string
}

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Tool registry entry with metadata
 */
export type ToolRegistryEntry<T = any> = {
  tool: T
  enabled: boolean
  registrationTime: number
}

/**
 * Tool registry for managing multiple tools
 */
export type ToolRegistry<T = any> = Map<string, ToolRegistryEntry<T>>

// ============================================================================
// Tool Execution Metadata
// ============================================================================

/**
 * Metadata for tool execution
 */
export type ToolExecutionMetadata = {
  toolName: string
  startTime: number
  endTime?: number
  success?: boolean
  error?: string
  inputSize?: number
  outputSize?: number
}

/**
 * Tool execution history entry
 */
export type ToolExecutionHistoryEntry = ToolExecutionMetadata & {
  id: string
  timestamp: number
  input?: Record<string, unknown>
  output?: unknown
}
