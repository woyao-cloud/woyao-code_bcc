import type { PermissionMode } from '../types/permissions.js'

/**
 * Check if we should ask for permission for a given operation
 */
export function shouldAskPermission(mode: PermissionMode): boolean {
  return mode === 'default' || mode === 'plan'
}

/**
 * Check if permissions are bypassed
 */
export function isBypassPermissions(mode: PermissionMode): boolean {
  return mode === 'bypassPermissions'
}
