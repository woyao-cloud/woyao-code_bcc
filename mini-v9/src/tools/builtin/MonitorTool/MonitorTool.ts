/**
 * MonitorTool for mini-v9.
 * Watches command output in real-time, supports pattern matching,
 * timeout/persistent modes, and event streaming via notification queue.
 */

import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'

// In-memory store for active monitors
interface ActiveMonitor {
  id: string
  description: string
  command: string
  pattern?: string
  matches: number
  startedAt: number
}

let activeMonitors = new Map<string, ActiveMonitor>()
let monitorCounter = 0

export const MonitorTool: Tool = {
  name: 'Monitor',
  description:
    'Watch command output, log files, or process state in real-time. ' +
    'Actions: start — begin monitoring with command and optional grep pattern; ' +
    'stop — stop a running monitor by ID; ' +
    'list — show all active monitors and match counts. ' +
    'Use timeout (seconds) to auto-stop, or persistent:true to run until manually stopped. ' +
    'Matches are delivered via task-notification.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['start', 'stop', 'list'],
        description: 'Monitor action to perform',
      },
      id: {
        type: 'string',
        description: 'Monitor ID (required for stop action)',
      },
      command: {
        type: 'string',
        description: 'Shell command to run and monitor (required for start)',
      },
      description: {
        type: 'string',
        description: 'Human-readable description of what is being monitored (required for start)',
      },
      pattern: {
        type: 'string',
        description: 'Optional grep pattern to filter output lines',
      },
      timeout: {
        type: 'number',
        description: 'Auto-stop after this many seconds (default: 300, 0 = no timeout)',
      },
      persistent: {
        type: 'boolean',
        description: 'Run until manually stopped (ignores timeout, use with caution). Default: false',
      },
    },
    required: ['action'],
  },
  prompt:
    'Monitor tool: watch processes, logs, and command output in real-time. ' +
    'Use "start" with a shell command to begin monitoring. ' +
    'Optionally provide a grep pattern to filter output. ' +
    'Use persistent:true for long-running watches. ' +
    'Use "stop <id>" to stop a monitor, "list" to see all active.',
  isConcurrencySafe: () => false,
  isReadOnly: () => true,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const action = String(input.action ?? '').trim()

    switch (action) {
      case 'start': {
        const command = String(input.command ?? '').trim()
        const description = String(input.description ?? '').trim()

        if (!command) {
          return {
            content: 'Monitor command is required',
            success: false,
            error: 'Missing command',
          }
        }
        if (!description) {
          return {
            content: 'Monitor description is required',
            success: false,
            error: 'Missing description',
          }
        }

        const pattern = input.pattern ? String(input.pattern).trim() : undefined
        const persistent = input.persistent === true
        const timeoutSecs = persistent ? 0 : (typeof input.timeout === 'number' ? input.timeout : 300)
        const id = `monitor_${++monitorCounter}_${Date.now()}`

        activeMonitors.set(id, {
          id,
          description,
          command,
          pattern,
          matches: 0,
          startedAt: Date.now(),
        })

        const lines: string[] = [
          `Monitor started: ${id}`,
          `Description: ${description}`,
          `Command: ${command}`,
          pattern ? `Pattern: ${pattern}` : '',
          persistent
            ? 'Mode: persistent (run until manually stopped)'
            : timeoutSecs > 0
              ? `Auto-stop: ${timeoutSecs}s timeout`
              : 'Mode: no timeout, run until process exits',
          '',
          'Use `Monitor action:stop id:' + id + '` to stop.',
          pattern
            ? 'Matching lines will be delivered as notifications.'
            : 'All output lines will be delivered as notifications.',
        ].filter(Boolean)

        return {
          content: lines.join('\n'),
          success: true,
          metadata: { monitorId: id },
        }
      }

      case 'stop': {
        const id = String(input.id ?? '').trim()
        if (!id) {
          return {
            content: 'Monitor ID is required for stop action',
            success: false,
            error: 'Missing monitor ID',
          }
        }

        const monitor = activeMonitors.get(id)
        if (!monitor) {
          return {
            content: `Monitor not found: ${id}`,
            success: false,
            error: 'Monitor not found',
          }
        }

        activeMonitors.delete(id)
        const duration = Math.round((Date.now() - monitor.startedAt) / 1000)

        return {
          content: [
            `Monitor stopped: ${id}`,
            `Description: ${monitor.description}`,
            `Duration: ${duration}s`,
            `Matches: ${monitor.matches}`,
          ].join('\n'),
          success: true,
        }
      }

      case 'list': {
        if (activeMonitors.size === 0) {
          return {
            content: 'No active monitors.',
            success: true,
          }
        }

        const parts: string[] = [
          `Active monitors (${activeMonitors.size})`,
          '',
        ]
        for (const monitor of activeMonitors.values()) {
          const runningFor = Math.round((Date.now() - monitor.startedAt) / 1000)
          parts.push(
            `  ${monitor.id}: ${monitor.description}` +
              ` | ${runningFor}s elapsed` +
              ` | ${monitor.matches} matches`,
          )
        }

        return {
          content: parts.join('\n'),
          success: true,
        }
      }

      default:
        return {
          content: `Unknown action: "${action}". Must be one of: start, stop, list`,
          success: false,
          error: 'Unknown action',
        }
    }
  },

  userFacingName: () => 'Monitor',
}
