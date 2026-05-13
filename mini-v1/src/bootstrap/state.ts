import { realpathSync } from 'fs'
import { cwd } from 'process'
import { randomUUID } from '../utils/crypto.js'
import { createSignal } from '../utils/signal.js'
import { sessionId } from '../types/ids.js'
import type { ModelSetting } from '../utils/model/model.js'

// ============================================================
// Session-global state (module-level singletons)
// ============================================================

export type ChannelEntry =
  | { kind: 'plugin'; name: string; marketplace: string; dev?: boolean }
  | { kind: 'server'; name: string; dev?: boolean }

/** Session state singleton */
export const state = {
  originalCwd: cwd(),
  projectRoot: cwd(),
  cwd: createSignal(cwd()),
  sessionId: sessionId(randomUUID()),
  isInteractive: false,
  mainLoopModelOverride: undefined as ModelSetting | undefined,
  initialMainLoopModel: undefined as unknown as ModelSetting,
  totalCostUSD: 0,
  totalAPIDuration: 0,
  totalToolDuration: 0,
  startTime: Date.now(),
  lastInteractionTime: Date.now(),
  totalLinesAdded: 0,
  totalLinesRemoved: 0,
  permissionMode: 'default' as const,
  clientType: 'cli',
  modelUsage: {} as Record<
    string,
    {
      inputTokens: number
      outputTokens: number
      cacheCreationInputTokens: number
      cacheReadInputTokens: number
    }
  >,
  sdkAgentProgressSummariesEnabled: false,
  userMsgOptIn: false,
  sessionSource: undefined as string | undefined,
  questionPreviewFormat: undefined as 'markdown' | 'html' | undefined,
  flagSettingsPath: undefined as string | undefined,
  flagSettingsInline: null as Record<string, unknown> | null,
  allowedSettingSources: [] as string[],
  sessionIngressToken: null as string | null,
  oauthTokenFromFd: null as string | null,
  apiKeyFromFd: null as string | null,
  strictToolResultPairing: false,
}

// Convenient re-exports from state singleton
export const getSessionId = () => state.sessionId
export const getCwd = () => state.cwd.get()
export const setCwd = (path: string) => {
  state.cwd.set(path)
}
