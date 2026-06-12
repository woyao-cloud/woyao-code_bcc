import { highlight } from 'cli-highlight'
import { dim, green, red, yellow, cyan } from './format.js'

let inCodeBlock = false
let codeLanguage = ''
let codeBuffer = ''

export function renderText(text: string, _columns?: number): string {
  if (!text) return ''
  return processChunk(text)
}

export function flushRenderer(): string {
  if (inCodeBlock && codeBuffer) {
    const result = formatCodeBlock(codeBuffer, codeLanguage, true)
    resetRenderer()
    return result
  }
  resetRenderer()
  return ''
}

export function resetRenderer(): void {
  inCodeBlock = false
  codeLanguage = ''
  codeBuffer = ''
}

function processChunk(text: string): string {
  let output = ''
  let remaining = text

  while (remaining.length > 0) {
    const fenceIdx = remaining.indexOf('```')

    if (fenceIdx < 0) {
      if (inCodeBlock) {
        codeBuffer += remaining
      } else {
        output += formatInline(remaining)
      }
      break
    }

    if (inCodeBlock) {
      // Closing fence
      codeBuffer += remaining.slice(0, fenceIdx)
      output += formatCodeBlock(codeBuffer, codeLanguage, false)
      inCodeBlock = false
      codeLanguage = ''
      codeBuffer = ''
      remaining = remaining.slice(fenceIdx + 3)
    } else {
      // Opening fence
      output += formatInline(remaining.slice(0, fenceIdx))
      const afterFence = remaining.slice(fenceIdx + 3)
      const langMatch = afterFence.match(/^(\w+)/)
      codeLanguage = langMatch ? langMatch[1] : ''
      const afterLang = langMatch
        ? afterFence.slice(langMatch[0].length)
        : afterFence

      inCodeBlock = true
      codeBuffer = ''
      remaining = afterLang.startsWith('\n') ? afterLang.slice(1) : afterLang
    }
  }

  return output
}

function formatCodeBlock(
  code: string,
  language: string,
  truncated: boolean,
): string {
  if (!code) return ''

  let highlighted: string
  try {
    highlighted = highlight(code, {
      language: language || undefined,
      ignoreIllegals: true,
    })
  } catch {
    highlighted = dim(code)
  }

  const lines = highlighted.split('\n')
  const formatted = lines
    .map(line => (line ? '  ' + line : ''))
    .join('\n')
    .replace(/\n+$/, '')

  if (truncated) {
    return (
      '\n' +
      formatted +
      '\n' +
      dim('  ─── (code block truncated, streaming) ───') +
      '\n\n'
    )
  }

  return '\n\n' + formatted + '\n\n'
}

function formatInline(text: string): string {
  let result = text

  // Inline `code` spans → yellow
  result = result.replace(/`([^`]+)`/g, (_, code: string) => {
    return yellow(code)
  })

  // URLs → dim
  result = result.replace(/https?:\/\/[^\s)]+/g, (url: string) => {
    return dim(url)
  })

  return result
}
