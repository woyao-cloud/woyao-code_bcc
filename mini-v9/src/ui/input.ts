import { stdin, stdout } from 'process'
import { emitKeypressEvents } from 'node:readline'

const ESC = '\x1b'
const CSI = ESC + '['

function cursorUp(n = 1): string {
  return CSI + n + 'A'
}
function cursorDown(n = 1): string {
  return CSI + n + 'B'
}
function cursorCol(n = 1): string {
  return CSI + n + 'G'
}
function clearLine(): string {
  return CSI + 'K'
}
function cursorHide(): string {
  return CSI + '?25l'
}
function cursorShow(): string {
  return CSI + '?25h'
}

export interface ReadInputOptions {
  prompt?: string
  history?: string[]
}

export class LineBuffer {
  lines: string[] = ['']
  cursorLine = 0
  cursorCol = 0
  prompt: string
  history: string[]
  historyIdx: number

  constructor(opts: ReadInputOptions = {}) {
    this.prompt = opts.prompt ?? '> '
    this.history = opts.history ?? []
    this.historyIdx = this.history.length
  }

  get text(): string {
    return this.lines.join('\n')
  }

  insert(ch: string): void {
    const line = this.lines[this.cursorLine]
    this.lines[this.cursorLine] = line.slice(0, this.cursorCol) + ch + line.slice(this.cursorCol)
    this.cursorCol++
  }

  newline(): void {
    const line = this.lines[this.cursorLine]
    const rest = line.slice(this.cursorCol)
    this.lines[this.cursorLine] = line.slice(0, this.cursorCol)
    this.lines.splice(this.cursorLine + 1, 0, rest)
    this.cursorLine++
    this.cursorCol = 0
  }

  backspace(): void {
    if (this.cursorCol === 0 && this.cursorLine === 0) return
    if (this.cursorCol === 0) {
      const prevLine = this.lines[this.cursorLine - 1]
      this.cursorCol = prevLine.length
      this.lines[this.cursorLine - 1] = prevLine + this.lines[this.cursorLine]
      this.lines.splice(this.cursorLine, 1)
      this.cursorLine--
    } else {
      const line = this.lines[this.cursorLine]
      this.lines[this.cursorLine] = line.slice(0, this.cursorCol - 1) + line.slice(this.cursorCol)
      this.cursorCol--
    }
  }

  left(): void {
    if (this.cursorCol > 0) {
      this.cursorCol--
    } else if (this.cursorLine > 0) {
      this.cursorLine--
      this.cursorCol = this.lines[this.cursorLine].length
    }
  }

  right(): void {
    const line = this.lines[this.cursorLine]
    if (this.cursorCol < line.length) {
      this.cursorCol++
    } else if (this.cursorLine < this.lines.length - 1) {
      this.cursorLine++
      this.cursorCol = 0
    }
  }

  home(): void {
    this.cursorCol = 0
  }

  end(): void {
    this.cursorCol = this.lines[this.cursorLine].length
  }

  wordLeft(): void {
    const line = this.lines[this.cursorLine]
    let col = Math.min(this.cursorCol, line.length)
    // Skip non-alphanumeric
    while (col > 0 && /\W/.test(line[col - 1] ?? '')) col--
    // Skip alphanumeric
    while (col > 0 && /\w/.test(line[col - 1] ?? '')) col--
    this.cursorCol = col
  }

  wordRight(): void {
    const line = this.lines[this.cursorLine]
    let col = this.cursorCol
    // Skip alphanumeric
    while (col < line.length && /\w/.test(line[col] ?? '')) col++
    // Skip non-alphanumeric
    while (col < line.length && /\W/.test(line[col] ?? '')) col++
    this.cursorCol = col
  }

  historyUp(): void {
    if (this.history.length === 0 || this.historyIdx <= 0) return
    this.historyIdx--
    const entry = this.history[this.historyIdx]
    if (entry !== undefined) {
      this.lines = entry.split('\n')
      this.cursorLine = this.lines.length - 1
      this.cursorCol = this.lines[this.cursorLine]?.length ?? 0
    }
  }

  historyDown(): void {
    if (this.historyIdx >= this.history.length - 1) {
      this.historyIdx = this.history.length
      this.lines = ['']
      this.cursorLine = 0
      this.cursorCol = 0
      return
    }
    this.historyIdx++
    const entry = this.history[this.historyIdx]
    if (entry !== undefined) {
      this.lines = entry.split('\n')
      this.cursorLine = this.lines.length - 1
      this.cursorCol = this.lines[this.cursorLine]?.length ?? 0
    }
  }

  submit(): string | null {
    const text = this.text.trim()
    if (!text) return null
    this.history.push(text)
    this.historyIdx = this.history.length
    return text
  }

  /** Clear rendered input lines. Returns ANSI sequence. */
  clearRendered(): string {
    const lineCount = this.lines.length
    let out = ''
    // If we rendered multiple lines, move up and clear each
    if (lineCount > 0) {
      out += '\r'
      for (let i = 0; i < lineCount; i++) {
        if (i > 0) out += cursorUp()
        out += clearLine()
        if (i < lineCount - 1) out += '\r'
      }
    }
    return out
  }

  /** Render the current buffer to stderr. Returns ANSI sequence for the caller to write. */
  render(): string {
    const cols = stdout.columns ?? 80
    let out = ''

    // Move up to the first line of the input
    if (this.lines.length > 1) {
      out += cursorUp(this.lines.length - 1)
    }

    // Render each line
    for (let i = 0; i < this.lines.length; i++) {
      out += '\r' + clearLine()
      const prefix = i === 0 ? this.prompt : '  '
      const display = prefix + (this.lines[i] ?? '')
      // Truncate to terminal width
      out += display.length > cols ? display.slice(0, cols - 1) + '…' : display
      if (i < this.lines.length - 1) {
        out += '\n'
      }
    }

    // Position cursor: calculate visual line and column
    const promptLen = this.prompt.length
    let visualLine = this.cursorLine
    let visualCol = this.cursorCol + promptLen

    // Handle line wrapping within the current line
    const currentLine = this.lines[this.cursorLine] ?? ''
    const lineWidth = promptLen + currentLine.length
    if (visualCol >= cols) {
      visualLine += Math.floor(visualCol / cols)
      visualCol = visualCol % cols
    }

    // Move cursor to correct position (relative from bottom)
    if (visualLine < this.lines.length - 1) {
      out += cursorUp(this.lines.length - 1 - visualLine)
    }
    out += '\r' + cursorCol(visualCol + 1)

    return out
  }
}

export function initRawInput(): void {
  if (stdin.isTTY) {
    stdin.setRawMode(true)
    stdin.resume()
    // readline.emitKeypressEvents(stdin) is already called by readline
    // In Bun/Node, we handle keypress directly
  }
}

export function restoreInput(): void {
  if (stdin.isTTY) {
    try {
      stdin.setRawMode(false)
    } catch {
      // Ignore — might not be in raw mode
    }
  }
}

export function readInput(opts: ReadInputOptions = {}): Promise<string | null> {
  const buf = new LineBuffer(opts)
  const inputHistory = opts.history ?? []

  return new Promise<string | null>(resolve => {
    if (!stdin.isTTY) {
      // Non-TTY fallback: read from stdin directly
      let data = ''
      const onData = (chunk: Buffer | string) => {
        data += typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
      }
      stdin.on('data', onData)
      // After a brief delay, resolve with whatever we got
      setTimeout(() => {
        stdin.removeListener('data', onData)
        resolve(data.trim() || null)
      }, 100)
      return
    }

    let active = true

    // Write prompt and hide cursor
    process.stderr.write(cursorHide() + buf.prompt)

    const onKeyPress = (_: string, key: { name: string; ctrl: boolean; meta: boolean; shift: boolean }) => {
      if (!active) return
      const keyName = key?.name ?? ''

      // Ctrl+C — abort/interrupt
      if ((key?.ctrl && keyName === 'c') || keyName === 'escape') {
        active = false
        cleanup()
        process.stderr.write(buf.clearRendered())
        process.stderr.write(cursorShow())
        resolve(null)
        return
      }

      // Ctrl+D — EOF/exit
      if (key?.ctrl && keyName === 'd') {
        active = false
        cleanup()
        process.stderr.write(buf.clearRendered())
        process.stderr.write(cursorShow())
        resolve(null)
        return
      }

      // Enter — submit (Shift+Enter = newline)
      if (keyName === 'return' || keyName === 'enter') {
        if (key?.shift) {
          buf.newline()
          process.stderr.write('\n' + buf.render())
          return
        }
        const result = buf.submit()
        if (result !== null) {
          active = false
          cleanup()
          // Clear rendered input, show the submitted text in scrollback
          const prompt = buf.prompt + result.replace(/\n/g, '\n  ')
          process.stderr.write(buf.clearRendered() + '\r' + prompt + '\n' + cursorShow())
          resolve(result)
        } else {
          // Empty input, just re-render
          process.stderr.write(buf.render())
        }
        return
      }

      // Backspace
      if (keyName === 'backspace') {
        buf.backspace()
        process.stderr.write(buf.render())
        return
      }

      // Delete
      if (keyName === 'delete') {
        buf.right()
        buf.backspace()
        process.stderr.write(buf.render())
        return
      }

      // Arrow keys
      if (keyName === 'up') {
        buf.historyUp()
        process.stderr.write(buf.render())
        return
      }
      if (keyName === 'down') {
        buf.historyDown()
        process.stderr.write(buf.render())
        return
      }
      if (keyName === 'left') {
        if (key?.ctrl) {
          buf.wordLeft()
        } else {
          buf.left()
        }
        process.stderr.write(buf.render())
        return
      }
      if (keyName === 'right') {
        if (key?.ctrl) {
          buf.wordRight()
        } else {
          buf.right()
        }
        process.stderr.write(buf.render())
        return
      }

      // Home/End
      if (keyName === 'home') {
        buf.home()
        process.stderr.write(buf.render())
        return
      }
      if (keyName === 'end') {
        buf.end()
        process.stderr.write(buf.render())
        return
      }

      // Tab: insert 2 spaces
      if (keyName === 'tab') {
        buf.insert('  ')
        process.stderr.write(buf.render())
        return
      }

      // Regular character input
      if (keyName === 'space') {
        buf.insert(' ')
        process.stderr.write(buf.render())
        return
      }
      if (keyName && keyName.length === 1 && !key?.ctrl && !key?.meta) {
        buf.insert(keyName)
        process.stderr.write(buf.render())
        return
      }
      // Fallback: raw string for chars keypress didn't name ('.'→'period', etc.)
      if (_ && _.length > 0 && !key?.ctrl && !key?.meta && _ !== keyName) {
        buf.insert(_)
        process.stderr.write(buf.render())
        return
      }
    }

    // Use emitKeypressEvents to parse raw bytes into key objects
    emitKeypressEvents(stdin)
    if (typeof stdin.setRawMode === 'function') {
      try {
        stdin.setRawMode(true)
        stdin.resume()
      } catch {
        // Ignore
      }
    }
    stdin.on('keypress', onKeyPress)

    // IME input handler: catch multi-byte UTF-8 (Chinese, emoji) that
    // emitKeypressEvents does NOT convert to keypress events.
    // Only processes non-ASCII bytes to avoid duplicating keypress.
    const onRawData = (data: Buffer) => {
      if (!active || !data || data.length === 0) return
      let hasNonAscii = false
      for (let i = 0; i < data.length; i++) {
        if (data[i]! >= 0x80) { hasNonAscii = true; break }
      }
      if (!hasNonAscii) return
      const str = data.toString('utf-8')
      for (const ch of str) {
        if (ch >= ' ' || ch === '\n') buf.insert(ch)
      }
      process.stderr.write(buf.render())
    }
    stdin.on('data', onRawData)

    function cleanup() {
      stdin.removeListener('keypress', onKeyPress)
      stdin.removeListener('data', onRawData)
      try {
        stdin.setRawMode(false)
      } catch {
        // Ignore
      }
    }
  })
}
