import type { QueryEvent } from '../query/transitions.js'
import type { Spinner } from './spinner.js'
import { green, red, yellow, cyan, dim, bold, gray } from './format.js'

export interface EventContext {
  spinner: Spinner
  turnCount: number
  totalInputTokens: number
  totalOutputTokens: number
  lastToolName: string
}

export function createEventContext(spinner: Spinner): EventContext {
  return {
    spinner,
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
      process.stdout.write(event.text)
      break
    }

    case 'tool_start': {
      ctx.spinner.stop()
      ctx.spinner.setGotFirstToken(true)
      if (ctx.lastToolName) process.stderr.write('\n')
      ctx.lastToolName = event.name
      process.stderr.write('  ' + cyan(event.name) + '...')
      break
    }

    case 'tool_result': {
      if (event.isError) {
        process.stderr.write(red(' (fail)\n'))
      } else if (ctx.lastToolName === event.name) {
        process.stderr.write(green(' (ok)\n'))
      }
      break
    }

    case 'usage': {
      ctx.totalInputTokens = event.totalInputTokens
      ctx.totalOutputTokens = event.totalOutputTokens
      break
    }

    case 'turn_end': {
      ctx.turnCount = event.turnCount
      break
    }

    case 'terminal': {
      ctx.spinner.stop()
      ctx.lastToolName = ''

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
      process.stderr.write(red('\n  Error: ' + event.message + '\n'))
      break
    }

    case 'recovery': {
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
