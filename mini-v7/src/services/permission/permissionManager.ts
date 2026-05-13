/**
 * Permission system for mini-v4.
 * Manages user approvals for tool executions.
 */

import { createInterface } from 'readline'

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

export interface PermissionRequest {
  toolName: string
  toolDescription: string
  input: Record<string, unknown>
}

let permissionMode: PermissionMode = 'default'
let sessionApprovals = new Map<string, boolean>()

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

  // Build prompt
  const inputPreview = JSON.stringify(req.input, null, 0).slice(0, 200)
  process.stderr.write('\n  Permission required: ' + req.toolName + '\n')
  process.stderr.write('  ' + req.toolDescription.slice(0, 100) + '\n')
  process.stderr.write('  Input: ' + inputPreview + '\n')

  const answer = await askUser('  Allow? (y/n/always): ')

  if (answer === 'always' || answer === 'a') {
    sessionApprovals.set(cacheKey, true)
    return true
  }
  if (answer === 'yes' || answer === 'y') {
    sessionApprovals.set(cacheKey, true)
    return true
  }
  return false
}

function askUser(question: string): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    })
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}
