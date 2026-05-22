import { stdin } from 'process'
import { dim, green, red, yellow, cyan, bold } from '../format.js'
import type { PermissionRequest } from '../../services/permission/permissionManager.js'
import type { PermissionChoice } from './types.js'

const BOX_W = 64

function hr(char = '─'): string {
  return char.repeat(BOX_W - 2)
}

function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text]
  const lines: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    lines.push(remaining.slice(0, maxWidth))
    remaining = remaining.slice(maxWidth)
  }
  return lines
}

function boxTop(title: string): string {
  const titleTag = ' ' + title + ' '
  const leftLen = Math.floor((BOX_W - 2 - titleTag.length) / 2)
  const rightLen = BOX_W - 2 - titleTag.length - leftLen
  return '┌' + '─'.repeat(leftLen) + titleTag + '─'.repeat(rightLen) + '┐'
}

function boxLine(): string {
  return '│' + ' '.repeat(BOX_W - 2) + '│'
}

function boxText(left: string, right?: string): string {
  const l = left.slice(0, BOX_W - 4)
  if (right) {
    const r = right.slice(0, Math.min(right.length, BOX_W - 4 - l.length - 1))
    const pad = BOX_W - 2 - l.length - r.length - 1
    return '│ ' + l + ' '.repeat(pad) + r + ' │'
  }
  return '│ ' + l + ' '.repeat(BOX_W - 3 - l.length) + '│'
}

function boxBottom(): string {
  return '└' + '─'.repeat(BOX_W - 2) + '┘'
}

function buildDialogLines(req: PermissionRequest): string[] {
  const lines: string[] = []

  lines.push(boxTop('Permission Required'))
  lines.push(boxLine())

  // Tool name and description
  lines.push(boxText(bold('Tool: ') + yellow(req.toolName)))
  const desc = req.toolDescription.slice(0, BOX_W - 6)
  if (desc) lines.push(boxText(dim(desc)))
  lines.push(boxLine())

  // Input preview
  const inputStr = JSON.stringify(req.input, null, 0).slice(0, 200)
  lines.push(boxText(dim('Input:')))
  const wrapped = wrapText(inputStr, BOX_W - 6)
  for (const w of wrapped) {
    lines.push(boxText(w))
  }
  lines.push(boxLine())

  // Options
  lines.push(boxText(green('(y) Allow') + '    ' + red('(n) Deny')))
  lines.push(boxText(cyan('(a) Always Allow') + '  ' + yellow('(d) Always Deny')))

  lines.push(boxBottom())

  return lines
}

export async function showPermissionDialog(
  req: PermissionRequest,
): Promise<PermissionChoice> {
  const lines = buildDialogLines(req)
  const height = lines.length

  // Write dialog to stderr
  for (const line of lines) {
    process.stderr.write(line + '\n')
  }

  // Read keypress
  const choice = await readPermissionKey()

  // Clear dialog lines from stderr
  process.stderr.write('\x1b[' + height + 'A') // cursor up to first dialog line
  for (let i = 0; i < height; i++) {
    process.stderr.write('\r\x1b[K') // clear current line
    if (i < height - 1) process.stderr.write('\x1b[1B') // cursor down
  }

  return choice
}

function readPermissionKey(): Promise<PermissionChoice> {
  return new Promise(resolve => {
    if (!stdin.isTTY) {
      resolve('allow')
      return
    }

    stdin.setRawMode(true)
    stdin.resume()

    const handler = (data: Buffer) => {
      const key = data.toString()

      if (key === 'y' || key === 'Y') {
        cleanup()
        resolve('allow')
      } else if (key === 'n' || key === 'N') {
        cleanup()
        resolve('deny')
      } else if (key === 'a' || key === 'A') {
        cleanup()
        resolve('always_allow')
      } else if (key === 'd' || key === 'D') {
        cleanup()
        resolve('always_deny')
      } else if (key === '\r' || key === '\n') {
        cleanup()
        resolve('allow')
      } else if (key === '\x1b') {
        cleanup()
        resolve('deny')
      }
      // else: ignore unknown keys
    }

    function cleanup() {
      stdin.removeListener('data', handler)
      try {
        stdin.setRawMode(false)
      } catch {
        // ignore
      }
    }

    stdin.on('data', handler)
  })
}
