import type { LocalCommandCall } from '../../types/command.js'
import {
  isPoorModeActive,
  setPoorMode,
  getPoorModeSince,
  getPoorModeStats,
} from './poorMode.js'

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export const call: LocalCommandCall = async (_, context) => {
  const currentlyActive = isPoorModeActive()
  const newState = !currentlyActive

  // Capture stats BEFORE toggling — setPoorMode(false) clears them
  const previousSince = currentlyActive ? getPoorModeSince() : null
  const previousStats = currentlyActive ? getPoorModeStats() : null

  setPoorMode(newState)

  if (newState) {
    // Disable prompt suggestion in AppState
    context.setAppState(prev => ({
      ...prev,
      promptSuggestionEnabled: false,
    }))
  } else {
    // Re-enable prompt suggestion
    context.setAppState(prev => ({
      ...prev,
      promptSuggestionEnabled: true,
    }))
  }

  const status = newState ? 'ON' : 'OFF'
  const details = newState
    ? 'extract_memories and prompt_suggestion are disabled'
    : 'extract_memories and prompt_suggestion are restored'

  let extra = ''
  if (newState) {
    const since = getPoorModeSince()
    if (since) {
      extra = ` (since ${new Date(since).toLocaleTimeString()})`
    }
  } else if (previousSince) {
    const duration = formatDuration(Date.now() - previousSince)
    const skipped = previousStats?.skippedMemoryExtractions ?? 0
    extra = ` — was active for ${duration}, skipped ${skipped} memory extraction(s)`
  }

  return { type: 'text', value: `Poor mode ${status} — ${details}${extra}` }
}
