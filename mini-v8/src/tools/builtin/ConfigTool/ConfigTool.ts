import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'
import {
  loadConfig,
  saveConfig,
} from '../../../services/config/configManager.js'

export const ConfigTool: Tool = {
  name: 'Config',
  description:
    'Read or update configuration settings. Use "get" to view current settings, "set <key>=<value>" to change a setting. ' +
    'Settings: model, maxTurns, permissionMode (default|acceptEdits|bypassPermissions), theme (dark|light), autoCompact.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description:
          'Command: "get" to view config, "set" to update (use key=value format)',
      },
      key: {
        type: 'string',
        description:
          'Config key for "set" command (e.g. "maxTurns", "permissionMode", "theme")',
      },
      value: {
        type: 'string',
        description: 'Config value for "set" command',
      },
    },
    required: ['command'],
  },
  prompt:
    'Config tool: read or update project configuration. Use "get" to view current settings, "set" with key and value to update.',
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,

  async execute(
    _ctx: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const command = String(input.command ?? '')
      .trim()
      .toLowerCase()

    if (command === 'get') {
      const config = loadConfig()
      const lines = Object.entries(config)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${v}`)
      return {
        content:
          lines.length > 0
            ? `Current config:\n${lines.join('\n')}`
            : 'No config set (all defaults active).',
        success: true,
      }
    }

    if (command === 'set') {
      const key = String(input.key ?? '').trim()
      const value = String(input.value ?? '').trim()
      if (!key || !value) {
        return {
          content: 'Both "key" and "value" are required for "set" command.',
          success: false,
          error: 'Missing key/value',
        }
      }

      const validKeys = [
        'model',
        'maxTurns',
        'permissionMode',
        'theme',
        'autoCompact',
      ]
      if (!validKeys.includes(key)) {
        return {
          content: `Unknown config key: "${key}". Valid keys: ${validKeys.join(', ')}`,
          success: false,
          error: 'Invalid key',
        }
      }

      const config = loadConfig()
      const parsed: Record<string, unknown> = {
        [key]: key === 'maxTurns' ? Number(value) : value,
      }
      ;(config as Record<string, unknown>)[key] = parsed[key]
      saveConfig(config)
      return { content: `Config updated: ${key}=${value}`, success: true }
    }

    return {
      content: `Unknown command: "${command}". Use "get" or "set".`,
      success: false,
      error: 'Invalid command',
    }
  },

  userFacingName: () => 'Config',
}
