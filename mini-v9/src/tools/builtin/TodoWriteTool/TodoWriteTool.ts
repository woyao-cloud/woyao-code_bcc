import type { Tool, ToolUseContext, ToolResult } from '../../../Tool.js'

interface TodoItem {
  id: string
  text: string
  done: boolean
}

let todoList: TodoItem[] = []
let todoCounter = 0

export const TodoWriteTool: Tool = {
  name: 'TodoWrite',
  description:
    'Manage a todo list. Supports adding, completing, and listing todo items (add/complete/list). Use to track pending work items.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: ['add', 'complete', 'list'],
        description: 'Command: add a todo, complete one, or list all',
      },
      text: {
        type: 'string',
        description: 'Todo text (required for "add" command)',
      },
      id: {
        type: 'string',
        description: 'Todo ID (required for "complete" command)',
      },
    },
    required: ['command'],
  },
  prompt:
    'TodoWrite tool: manage TODO list for tracking pending tasks. Use "add" to create, "complete" to mark done, "list" to view all.',
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

    switch (command) {
      case 'add': {
        const text = String(input.text ?? '').trim()
        if (!text) {
          return {
            content: 'Todo text is required for "add" command',
            success: false,
            error: 'Missing text',
          }
        }
        todoCounter++
        const id = `todo_${todoCounter}`
        todoList.push({ id, text, done: false })
        return {
          content: `Todo added: [${id}] ${text} (${todoList.filter(t => !t.done).length} pending)`,
          success: true,
          metadata: { todoId: id },
        }
      }

      case 'complete': {
        const id = String(input.id ?? '').trim()
        if (!id) {
          return {
            content: 'Todo ID is required for "complete" command',
            success: false,
            error: 'Missing id',
          }
        }
        const item = todoList.find(t => t.id === id)
        if (!item) {
          return {
            content: `Todo not found: ${id}`,
            success: false,
            error: 'Not found',
          }
        }
        item.done = true
        return {
          content: `Todo completed: [${id}] ${item.text} (${todoList.filter(t => !t.done).length} remaining)`,
          success: true,
        }
      }

      case 'list': {
        if (todoList.length === 0) {
          return { content: 'No todos.', success: true }
        }
        const lines = todoList.map(
          t => `${t.done ? '[x]' : '[ ]'} [${t.id}] ${t.text}`,
        )
        const pending = todoList.filter(t => !t.done).length
        return {
          content: `${todoList.length} todos (${pending} pending):\n${lines.join('\n')}`,
          success: true,
        }
      }

      default:
        return {
          content: `Unknown command: "${command}". Use: add, complete, list`,
          success: false,
          error: 'Invalid command',
        }
    }
  },

  userFacingName: () => 'TodoWrite',
}
