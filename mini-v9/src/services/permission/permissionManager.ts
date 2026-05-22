/**
 * Permission system for mini-v4.
 * Manages user approvals for tool executions.
 */

import { showPermissionDialog } from '../../ui/dialogs/permissionDialog.js'
import type { PermissionChoice } from '../../ui/dialogs/types.js'

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

export interface PermissionRequest {
  toolName: string
  toolDescription: string
  input: Record<string, unknown>
}

let permissionMode: PermissionMode = 'default'
let sessionApprovals = new Map<string, boolean>()
let sessionDenials = new Map<string, boolean>()

export function setPermissionMode(mode: PermissionMode): void {
  permissionMode = mode
}

export function getPermissionMode(): PermissionMode {
  return permissionMode
}

/**
 * Check if a tool requires permission.
 * Destructive tools (Bash, Write, Edit) need permission in default mode.
 */
export function needsPermission(toolName: string): boolean {
  if (permissionMode === 'bypassPermissions') return false
  const dangerousTools = ['Bash', 'Write', 'Edit', 'ApplyPatch', 'WebFetch']
  return dangerousTools.includes(toolName)
}

/**
 * Ask the user for permission to execute a tool.
 */
export async function requestPermission(
  req: PermissionRequest,
): Promise<boolean> {
  if (!needsPermission(req.toolName)) return true

  if (permissionMode === 'acceptEdits') {
    if (['Write', 'Edit', 'ApplyPatch'].includes(req.toolName)) return true
  }

  // Check session cache
  const cacheKey = req.toolName + ':' + JSON.stringify(req.input).slice(0, 200)
  if (sessionApprovals.has(cacheKey)) {
    return sessionApprovals.get(cacheKey)!
  }
  if (sessionDenials.has(cacheKey)) {
    return false
  }

  const choice = await showPermissionDialog(req)

  switch (choice) {
    case 'allow':
      return true
    case 'always_allow':
      sessionApprovals.set(cacheKey, true)
      return true
    case 'always_deny':
      sessionDenials.set(cacheKey, false)
      return false
    case 'deny':
    default:
      return false
  }
}
