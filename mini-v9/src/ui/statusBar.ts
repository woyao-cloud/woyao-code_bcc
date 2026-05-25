import { stdout } from 'process'
import type { UIStateManager, UIState } from './state.js'
import { dim, green, red, yellow, cyan, bold } from './format.js'

export interface StatusBar {
  start: () => void
  stop: () => void
}

export function createStatusBar(stateManager: UIStateManager): StatusBar {
  let active = false
  let unsubscribe: () => void = () => {}
  let lastText = ''

  function getDisplayText(): string {
    const state = stateManager.getState()
    const cols = stdout.columns ?? 80

    const parts: string[] = []

    // Status icon
    if (state.status === 'streaming') parts.push(green('●'))
    else if (state.status === 'executing_tools') parts.push(yellow('●'))
    else parts.push(cyan('●'))

    // State name
    parts.push(state.status)

    // Current tool name
    if (state.currentToolName) {
      parts.push(dim('│'))
      parts.push(yellow(state.currentToolName))
    }

    // Token counts
    if (state.totalInputTokens > 0 || state.totalOutputTokens > 0) {
      parts.push(dim('│'))
      parts.push(dim('in:') + String(state.totalInputTokens))
      parts.push(dim('out:') + String(state.totalOutputTokens))
    }

    // Turn count
    if (state.turnCount > 0) {
      parts.push(dim('│'))
      parts.push(dim('turn:') + String(state.turnCount))
    }

    let text = parts.join(' ')

    // Truncate to terminal width
    if (text.length > cols) {
      text = text.slice(0, cols - 4) + dim('...')
    }

    // Wrap with dim dashes for visual separation
    const padding = Math.max(0, cols - text.length - 4)
    if (padding > 0) {
      const left = Math.floor(padding / 2)
      const right = padding - left
      text = dim('─') + ' '.repeat(left) + text + ' '.repeat(right) + dim('─')
    }

    return text
  }

  function draw(): void {
    if (!active) return
    const text = getDisplayText()
    lastText = text

    // Save cursor → move to bottom line → clear + write → restore cursor
    process.stderr.write('\x1b7')
    process.stderr.write('\x1b[999;1H')
    process.stderr.write('\r\x1b[K' + text + '\n')
    process.stderr.write('\x1b8')
  }

  function start(): void {
    if (active) return
    active = true
    unsubscribe = stateManager.subscribe(draw)
    draw()
  }

  function stop(): void {
    if (!active) return
    active = false
    unsubscribe()

    // Redraw the bottom line to clear any trailing content
    process.stderr.write('\x1b7')
    process.stderr.write('\x1b[999;1H')
    process.stderr.write('\r\x1b[K')
    process.stderr.write('\x1b8')

    lastText = ''
  }

  return { start, stop }
}
