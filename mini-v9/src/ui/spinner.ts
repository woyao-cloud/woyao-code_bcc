const spinChars = ['/', '-', '\\', '|']

export interface Spinner {
  start: () => void
  stop: () => void
  update: (message: string) => void
  setGotFirstToken: (value: boolean) => boolean
}

export function createSpinner(): Spinner {
  let spinInterval: ReturnType<typeof setInterval> | null = null
  let spinIdx = 0
  let _gotFirstToken = false
  let currentMessage = 'Thinking...'

  const start = () => {
    _gotFirstToken = false
    spinInterval = setInterval(() => {
      if (_gotFirstToken) {
        clearInterval(spinInterval!)
        spinInterval = null
        return
      }
      process.stderr.write('\r  ' + (spinChars[spinIdx] ?? '') + ' ' + currentMessage)
      spinIdx = (spinIdx + 1) % 4
    }, 120)
  }

  const stop = () => {
    if (spinInterval) {
      clearInterval(spinInterval)
      spinInterval = null
    }
    process.stderr.write('\r' + ' '.repeat(40) + '\r')
  }

  const update = (message: string) => {
    currentMessage = message
  }

  const setGotFirstToken = (value: boolean): boolean => {
    const wasAlready = _gotFirstToken
    _gotFirstToken = value
    return wasAlready
  }

  return { start, stop, update, setGotFirstToken }
}
