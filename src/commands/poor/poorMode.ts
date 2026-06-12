/**
 * Poor mode state — when active, skips extract_memories and prompt_suggestion
 * to reduce token consumption.
 *
 * Persisted to settings.json so it survives session restarts.
 */

import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

let poorModeActive: boolean | null = null
let poorModeSince: number | null = null
let skippedMemoryExtractions = 0

export function isPoorModeActive(): boolean {
  if (poorModeActive === null) {
    poorModeActive = getInitialSettings().poorMode === true
    if (poorModeActive) {
      poorModeSince = Date.now()
    }
  }
  return poorModeActive
}

export function setPoorMode(active: boolean): void {
  poorModeActive = active
  if (active) {
    poorModeSince = Date.now()
    skippedMemoryExtractions = 0
  } else {
    poorModeSince = null
    skippedMemoryExtractions = 0
  }
  updateSettingsForSource('userSettings', {
    poorMode: active || undefined,
  })
}

export function getPoorModeSince(): number | null {
  return poorModeSince
}

export function getPoorModeStats(): { skippedMemoryExtractions: number } {
  return { skippedMemoryExtractions }
}

export function incrementSkippedMemoryExtraction(): void {
  if (poorModeActive) {
    skippedMemoryExtractions++
  }
}
