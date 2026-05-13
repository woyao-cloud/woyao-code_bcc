/**
 * Create an AbortController with optional timeout
 */
export function createAbortController(timeoutMs?: number): {
  controller: AbortController
  signal: AbortSignal
  clear: () => void
} {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  if (timeoutMs && timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), timeoutMs)
  }

  return {
    controller,
    signal: controller.signal,
    clear: () => {
      if (timer) clearTimeout(timer)
    },
  }
}
