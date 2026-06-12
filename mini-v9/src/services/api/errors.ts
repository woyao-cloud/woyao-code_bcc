/**
 * API Error handling — error type detection, user-friendly messages,
 * and the main getAssistantMessageFromError() converter.
 *
 * Adapted for mini-v9: works with BetaMessageParam format.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ============================================================
// Constants
// ============================================================

export const API_ERROR_MESSAGE_PREFIX = 'API Error'
export const PROMPT_TOO_LONG_ERROR_MESSAGE = 'Prompt is too long'
export const CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE = 'Credit balance is too low'
export const INVALID_API_KEY_ERROR_MESSAGE = 'Not logged in · Please run /login'
export const INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL =
  'Invalid API key · Fix external API key'
export const TOKEN_REVOKED_ERROR_MESSAGE =
  'OAuth token revoked · Please run /login'
export const OAUTH_ORG_NOT_ALLOWED_ERROR_MESSAGE =
  'Your account does not have access to Claude Code. Please run /login.'
export const API_TIMEOUT_ERROR_MESSAGE = 'Request timed out'

export const API_IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024 // 5MB base64 limit
export const API_PDF_MAX_PAGES = 100
export const PDF_TARGET_RAW_SIZE = 32 * 1024 * 1024 // 32MB

// ============================================================
// Prompt Too Long detection
// ============================================================

/**
 * Check if a BetaMessageParam is a prompt-too-long error message.
 * Works on content text since mini-v9 doesn't use wrapped Message types.
 */
export function isPromptTooLongMessage(msg: BetaMessageParam): boolean {
  if (msg.role !== 'assistant') return false
  const content = msg.content
  if (!Array.isArray(content)) return false
  return content.some(
    block =>
      block.type === 'text' &&
      block.text.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE),
  )
}

/**
 * Parse actual/limit token counts from a raw prompt-too-long API error message.
 */
export function parsePromptTooLongTokenCounts(rawMessage: string): {
  actualTokens: number | undefined
  limitTokens: number | undefined
} {
  const match = rawMessage.match(
    /prompt is too long[^0-9]*(\d+)\s*tokens?\s*>\s*(\d+)/i,
  )
  return {
    actualTokens: match ? parseInt(match[1]!, 10) : undefined,
    limitTokens: match ? parseInt(match[2]!, 10) : undefined,
  }
}

/**
 * Returns how many tokens over the limit a prompt-too-long error reports.
 */
export function getPromptTooLongTokenGap(
  msg: BetaMessageParam,
): number | undefined {
  if (!isPromptTooLongMessage(msg)) return undefined

  // Extract error details from content text (after the known prefix)
  const content = msg.content
  if (!Array.isArray(content)) return undefined

  for (const block of content) {
    if (
      block.type === 'text' &&
      block.text.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)
    ) {
      const rawDetails = block.text
        .substring(PROMPT_TOO_LONG_ERROR_MESSAGE.length)
        .trim()
      const { actualTokens, limitTokens } =
        parsePromptTooLongTokenCounts(rawDetails)
      if (actualTokens !== undefined && limitTokens !== undefined) {
        const gap = actualTokens - limitTokens
        return gap > 0 ? gap : undefined
      }
    }
  }
  return undefined
}

// ============================================================
// Media Size Error detection
// ============================================================

export function isMediaSizeError(raw: string): boolean {
  return (
    (raw.includes('image exceeds') && raw.includes('maximum')) ||
    (raw.includes('image dimensions exceed') && raw.includes('many-image')) ||
    /maximum of \d+ PDF pages/.test(raw)
  )
}

export function isMediaSizeErrorMessage(msg: BetaMessageParam): boolean {
  if (msg.role !== 'assistant') return false
  const content = msg.content
  if (!Array.isArray(content)) return false
  return content.some(
    block => block.type === 'text' && isMediaSizeError(block.text),
  )
}

// ============================================================
// User-facing error message helpers
// ============================================================

export function getPdfTooLargeErrorMessage(): string {
  return `PDF too large (max ${API_PDF_MAX_PAGES} pages, ${formatFileSize(PDF_TARGET_RAW_SIZE)}). Try reading the file a different way (e.g., extract text with pdftotext).`
}

export function getPdfPasswordProtectedErrorMessage(): string {
  return 'PDF is password protected. Try using a CLI tool to extract or convert the PDF.'
}

export function getPdfInvalidErrorMessage(): string {
  return 'The PDF file was not valid. Try converting it to text first (e.g., pdftotext).'
}

export function getImageTooLargeErrorMessage(): string {
  return 'Image was too large. Try resizing the image or using a different approach.'
}

export function getRequestTooLargeErrorMessage(): string {
  return `Request too large (max ${formatFileSize(PDF_TARGET_RAW_SIZE)}). Try with a smaller file.`
}

export function getTokenRevokedErrorMessage(): string {
  return TOKEN_REVOKED_ERROR_MESSAGE
}

export function getOauthOrgNotAllowedErrorMessage(): string {
  return OAUTH_ORG_NOT_ALLOWED_ERROR_MESSAGE
}

// ============================================================
// getAssistantMessageFromError — 25+ branch error converter
// ============================================================

/**
 * Convert any API error into a user-friendly assistant message.
 * Returns BetaMessageParam for direct use in mini-v9's conversation format.
 */
export function getAssistantMessageFromError(
  error: unknown,
  model: string,
): BetaMessageParam {
  // Timeout errors
  if (isTimeoutError(error)) {
    return createErrorContent(API_TIMEOUT_ERROR_MESSAGE)
  }

  // Image size errors (thrown before API call)
  if (isImageSizeError(error)) {
    return createErrorContent(getImageTooLargeErrorMessage())
  }

  // Prompt too long
  if (isPromptTooLongError(error)) {
    return createErrorContent(
      PROMPT_TOO_LONG_ERROR_MESSAGE,
      error instanceof Error ? error.message : undefined,
    )
  }

  // PDF errors
  if (isPdfPageLimitError(error)) {
    return createErrorContent(getPdfTooLargeErrorMessage())
  }
  if (isPdfPasswordError(error)) {
    return createErrorContent(getPdfPasswordProtectedErrorMessage())
  }
  if (isPdfInvalidError(error)) {
    return createErrorContent(getPdfInvalidErrorMessage())
  }

  // Image size from API (400)
  if (isApiImageTooLargeError(error)) {
    return createErrorContent(getImageTooLargeErrorMessage())
  }

  // Many-image dimension errors
  if (isManyImageDimensionError(error)) {
    return createErrorContent(
      'An image in the conversation exceeds the dimension limit for many-image requests (2000px). Start a new session with fewer images.',
    )
  }

  // 413 Request too large
  if (isRequestTooLargeError(error)) {
    return createErrorContent(getRequestTooLargeErrorMessage())
  }

  // Credit balance too low
  if (isCreditBalanceError(error)) {
    return createErrorContent(CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE)
  }

  // Auth errors
  if (isApiKeyError(error)) {
    return createErrorContent(INVALID_API_KEY_ERROR_MESSAGE)
  }

  // Default: API Error with original message
  const message = error instanceof Error ? error.message : String(error)
  return createErrorContent(`${API_ERROR_MESSAGE_PREFIX}: ${message}`)
}

// ============================================================
// Content refusal handling
// ============================================================

export function getErrorMessageIfRefusal(
  stopReason: string | null,
): BetaMessageParam | undefined {
  if (stopReason !== 'refusal') return undefined

  return createErrorContent(
    `${API_ERROR_MESSAGE_PREFIX}: Claude Code is unable to respond to this request, which appears to violate our Usage Policy. Try rephrasing the request or attempting a different approach.`,
  )
}

// ============================================================
// Internal helpers
// ============================================================

function createErrorContent(
  text: string,
  _errorDetails?: string,
): BetaMessageParam {
  const content = [{ type: 'text' as const, text }]
  return { role: 'assistant', content }
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${bytes}B`
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes('timeout') || msg.includes('timed out')
}

function isImageSizeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === 'ImageSizeError'
}

function isPromptTooLongError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.message.toLowerCase().includes('prompt is too long')
}

function isPdfPageLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /maximum of \d+ PDF pages/.test(err.message)
}

function isPdfPasswordError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.message.includes('The PDF specified is password protected')
}

function isPdfInvalidError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.message.includes('The PDF specified was not valid')
}

function isApiImageTooLargeError(err: unknown): boolean {
  if (!isAPIError(err)) return false
  return (
    err.status === 400 &&
    err.message.includes('image exceeds') &&
    err.message.includes('maximum')
  )
}

function isManyImageDimensionError(err: unknown): boolean {
  if (!isAPIError(err)) return false
  return (
    err.status === 400 &&
    err.message.includes('image dimensions exceed') &&
    err.message.includes('many-image')
  )
}

function isRequestTooLargeError(err: unknown): boolean {
  if (!isAPIError(err)) return false
  return err.status === 413
}

function isCreditBalanceError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.message.includes('Your credit balance is too low')
}

function isApiKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.message.toLowerCase().includes('x-api-key')
}

function isAPIError(err: unknown): { status: number; message: string } | false {
  if (!(err instanceof Error)) return false
  const status = (err as unknown as Record<string, unknown>).status as
    | number
    | undefined
  if (status !== undefined && typeof status === 'number') {
    return { status, message: err.message }
  }
  return false
}
