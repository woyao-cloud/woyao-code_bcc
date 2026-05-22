import type { QueryEvent } from '../query/transitions.js'
import type { Spinner } from './spinner.js'
import type { UIStateManager } from './state.js'
import { green, red, yellow, cyan, dim } from './format.js'
import { renderText, flushRenderer, resetRenderer } from './renderer.js'

export interface EventContext {
  spinner: Spinner
  stateManager: UIStateManager
  turnCount: number
  totalInputTokens: number
  totalOutputTokens: number
  lastToolName: string
}

export function createEventContext(spinner: Spinner, stateManager: UIStateManager): EventContext {
  return {
    spinner,
    stateManager,
    turnCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    lastToolName: '',
  }
}

export function handleEvent(
  ctx: EventContext,
  event: QueryEvent,
): void {
  switch (event.type) {
    case 'text_delta': {
      if (!ctx.spinner.setGotFirstToken(true)) {
        ctx.spinner.stop()
      }
      ctx.stateManager.setState({ status: 'streaming' })
      process.stdout.write(renderText(event.text))
      break
    }

    case 'tool_start': {
      ctx.spinner.stop()
      ctx.spinner.setGotFirstToken(true)
      if (ctx.lastToolName) process.stderr.write('\n')
      ctx.lastToolName = event.name
      ctx.stateManager.setState({ status: 'executing_tools', currentToolName: event.name })
      ctx.spinner.update(event.name + '...')
      ctx.spinner.start()
      break
    }

    case 'tool_result': {
      if (event.isError) {
        process.stderr.write(red(' (fail)\n'))
      } else if (ctx.lastToolName === event.name) {
        process.stderr.write(green(' (ok)\n'))
      }
      ctx.stateManager.setState({ currentToolName: '' })
      break
    }

    case 'usage': {
      ctx.totalInputTokens = event.totalInputTokens
      ctx.totalOutputTokens = event.totalOutputTokens
      ctx.stateManager.setState({
        totalInputTokens: event.totalInputTokens,
        totalOutputTokens: event.totalOutputTokens,
      })
      break
    }

    case 'turn_end': {
      ctx.turnCount = event.turnCount
      ctx.stateManager.setState({ turnCount: event.turnCount })
      break
    }

    case 'terminal': {
      ctx.spinner.stop()
      ctx.lastToolName = ''
      ctx.stateManager.reset()
      const flushed = flushRenderer()
      if (flushed) process.stdout.write(flushed)

      if (event.turnCount > 1) {
        process.stderr.write(
          '\n' +
          dim('  Tokens: ') +
          yellow(String(ctx.totalInputTokens)) +
          dim(' in / ') +
          yellow(String(ctx.totalOutputTokens)) +
          dim(' out | ') +
          yellow(String(event.turnCount)) +
          dim(' turns\n'),
        )
      }
      break
    }

    case 'error': {
      ctx.spinner.stop()
      ctx.stateManager.setState({ status: 'idle', errorMessage: event.message })
      resetRenderer()
      process.stderr.write(red('\n  Error: ' + event.message + '\n'))
      break
    }

    case 'recovery': {
      ctx.stateManager.setState({ status: 'thinking' })
      break
    }

    case 'retry_event': {
      process.stderr.write(
        yellow(`\n  [Retry ${event.attempt}/${event.maxRetries}] ${event.error}\n`),
      )
      break
    }
  }
}
