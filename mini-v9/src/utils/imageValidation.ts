/**
 * Image validation — pre-API size/dimension checks to prevent 400 errors.
 * Validates base64 image sizes before sending to the API.
 */

import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// ============================================================
// Constants
// ============================================================

const API_IMAGE_MAX_BASE64_SIZE = 5 * 1024 * 1024 // 5MB base64 limit

// ============================================================
// Types
// ============================================================

export interface OversizedImage {
  index: number
  size: number
}

// ============================================================
// Custom Error
// ============================================================

export class ImageSizeError extends Error {
  constructor(oversizedImages: OversizedImage[], maxSize: number) {
    const firstImage = oversizedImages[0]
    if (oversizedImages.length === 1 && firstImage) {
      const message =
        `Image base64 size (${formatFileSize(firstImage.size)}) exceeds API limit (${formatFileSize(maxSize)}). ` +
        `Please resize the image before sending.`
      super(message)
    } else {
      const message =
        `${oversizedImages.length} images exceed the API limit (${formatFileSize(maxSize)}): ` +
        oversizedImages
          .map(img => `Image ${img.index}: ${formatFileSize(img.size)}`)
          .join(', ') +
        `. Please resize these images before sending.`
      super(message)
    }
    this.name = 'ImageSizeError'
  }
}

// ============================================================
// Validation
// ============================================================

/**
 * Type guard: check if a content block is a base64 image block.
 */
function isBase64ImageBlock(
  block: unknown,
): block is { type: 'image'; source: { type: 'base64'; data: string } } {
  if (typeof block !== 'object' || block === null) return false
  const b = block as Record<string, unknown>
  if (b.type !== 'image') return false
  const source = b.source as Record<string, unknown> | undefined
  if (!source || source.type !== 'base64') return false
  return typeof source.data === 'string'
}

/**
 * Validate all images in messages for API size limits.
 * Throws ImageSizeError if any image exceeds the limit.
 * Call this before sending messages to the API.
 */
export function validateImagesForAPI(messages: BetaMessageParam[]): void {
  const oversizedImages: OversizedImage[] = []
  let imageIndex = 0

  for (const msg of messages) {
    if (msg.role !== 'user') continue

    const content = msg.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (isBase64ImageBlock(block)) {
        imageIndex++
        const base64Size = block.source.data.length
        if (base64Size > API_IMAGE_MAX_BASE64_SIZE) {
          oversizedImages.push({ index: imageIndex, size: base64Size })
        }
      }
    }
  }

  if (oversizedImages.length > 0) {
    throw new ImageSizeError(oversizedImages, API_IMAGE_MAX_BASE64_SIZE)
  }
}

// ============================================================
// Helpers
// ============================================================

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${bytes}B`
}
