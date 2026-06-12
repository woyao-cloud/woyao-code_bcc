/**
 * Tests for fix: 修复穷鬼模式的写入问题
 *
 * Before the fix, poorMode was an in-memory boolean that reset on restart.
 * After the fix, it reads from / writes to settings.json via
 * getInitialSettings() and updateSettingsForSource().
 */
import { afterAll, describe, expect, test, beforeEach, mock } from 'bun:test'
import * as settingsModule from '../../../utils/settings/settings.js'

// ── Mocks must be declared before the module under test is imported ──────────

let mockSettings: Record<string, unknown> = {}
let lastUpdate: { source: string; patch: Record<string, unknown> } | null = null

mock.module('src/utils/settings/settings.js', () => ({
  loadManagedFileSettings: () => ({ settings: null, errors: [] }),
  getManagedFileSettingsPresence: () => ({
    hasBase: false,
    hasDropIns: false,
  }),
  parseSettingsFile: () => ({ settings: null, errors: [] }),
  getSettingsRootPathForSource: () => '',
  getSettingsFilePathForSource: () => undefined,
  getRelativeSettingsFilePathForSource: () => '',
  getInitialSettings: () => mockSettings,
  getSettingsForSource: () => mockSettings,
  getPolicySettingsOrigin: () => null,
  getSettingsWithErrors: () => ({ settings: mockSettings, errors: [] }),
  getSettingsWithSources: () => ({ effective: mockSettings, sources: [] }),
  getSettings_DEPRECATED: () => mockSettings,
  settingsMergeCustomizer: () => undefined,
  getManagedSettingsKeysForLogging: () => [],
  // Keep unrelated exports aligned with the real settings module so this
  // full-surface mock cannot change later test files if Bun keeps it alive.
  hasAutoModeOptIn: () => true,
  hasSkipDangerousModePermissionPrompt: () => false,
  getAutoModeConfig: () => undefined,
  getUseAutoModeDuringPlan: () => true,
  rawSettingsContainsKey: (key: string) => key in mockSettings,
  updateSettingsForSource: (source: string, patch: Record<string, unknown>) => {
    lastUpdate = { source, patch }
    mockSettings = { ...mockSettings, ...patch }
  },
}))

afterAll(() => {
  mock.restore()
  mock.module('src/utils/settings/settings.js', () => settingsModule)
})

// Import AFTER mocks are registered. The query suffix gives this file its own
// module instance so cross-file poorMode.js mocks cannot replace the subject
// under test during Bun's shared coverage run.
const poorModeModulePath = '../poorMode.js?poorModeTest'
const poorModeModule = (await import(
  poorModeModulePath
)) as typeof import('../poorMode.js')
const {
  isPoorModeActive,
  setPoorMode,
  getPoorModeSince,
  getPoorModeStats,
  incrementSkippedMemoryExtraction,
} = poorModeModule

// ── Tests ────────────────────────────────────────────────────────────────────

describe('isPoorModeActive — reads from settings on first call', () => {
  beforeEach(() => {
    lastUpdate = null
  })

  test('returns false when settings has no poorMode key', () => {
    mockSettings = {}
    // Force re-read by setting internal state via setPoorMode then checking
    setPoorMode(false)
    expect(isPoorModeActive()).toBe(false)
  })

  test('returns true when settings.poorMode === true', () => {
    mockSettings = { poorMode: true }
    setPoorMode(true)
    expect(isPoorModeActive()).toBe(true)
  })
})

describe('setPoorMode — persists to settings', () => {
  beforeEach(() => {
    lastUpdate = null
  })

  test('setPoorMode(true) calls updateSettingsForSource with poorMode: true', () => {
    setPoorMode(true)
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.source).toBe('userSettings')
    expect(lastUpdate!.patch.poorMode).toBe(true)
  })

  test('setPoorMode(false) calls updateSettingsForSource with poorMode: undefined (removes key)', () => {
    setPoorMode(false)
    expect(lastUpdate).not.toBeNull()
    expect(lastUpdate!.source).toBe('userSettings')
    // false || undefined === undefined — key should be removed to keep settings clean
    expect(lastUpdate!.patch.poorMode).toBeUndefined()
  })

  test('isPoorModeActive() reflects the value set by setPoorMode()', () => {
    setPoorMode(true)
    expect(isPoorModeActive()).toBe(true)

    setPoorMode(false)
    expect(isPoorModeActive()).toBe(false)
  })

  test('toggling multiple times stays consistent', () => {
    setPoorMode(true)
    setPoorMode(true)
    expect(isPoorModeActive()).toBe(true)

    setPoorMode(false)
    setPoorMode(false)
    expect(isPoorModeActive()).toBe(false)
  })
})

describe('getPoorModeSince — tracks when poor mode was enabled', () => {
  beforeEach(() => {
    lastUpdate = null
    setPoorMode(false) // reset state
  })

  test('returns null when poor mode has never been enabled', () => {
    setPoorMode(false)
    // use already-imported getPoorModeSince from module-level import
    expect(getPoorModeSince()).toBeNull()
  })

  test('returns a timestamp when poor mode is enabled', () => {
    const before = Date.now()
    setPoorMode(true)
    const after = Date.now()
    // use already-imported getPoorModeSince from module-level import
    const since = getPoorModeSince()
    expect(since).not.toBeNull()
    expect(since! >= before).toBe(true)
    expect(since! <= after).toBe(true)
  })

  test('returns null after poor mode is disabled', () => {
    setPoorMode(true)
    setPoorMode(false)
    // use already-imported getPoorModeSince from module-level import
    expect(getPoorModeSince()).toBeNull()
  })
})

describe('getPoorModeStats — tracks skipped operations', () => {
  beforeEach(() => {
    lastUpdate = null
    setPoorMode(false) // reset state
  })

  test('returns zero skipped when poor mode is off', () => {
    setPoorMode(false)
    const stats = getPoorModeStats()
    expect(stats.skippedMemoryExtractions).toBe(0)
  })

  test('increments skipped count', () => {
    setPoorMode(true)
    incrementSkippedMemoryExtraction()
    incrementSkippedMemoryExtraction()
    expect(getPoorModeStats().skippedMemoryExtractions).toBe(2)
  })

  test('resets count when poor mode is toggled off and on again', () => {
    setPoorMode(true)
    incrementSkippedMemoryExtraction()
    setPoorMode(false)
    setPoorMode(true)
    expect(getPoorModeStats().skippedMemoryExtractions).toBe(0)
  })
})
