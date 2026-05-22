export type UIStatus = 'idle' | 'thinking' | 'streaming' | 'executing_tools'

export interface UIState {
  status: UIStatus
  currentToolName: string
  totalInputTokens: number
  totalOutputTokens: number
  turnCount: number
  errorMessage: string | null
}

type Listener = (state: UIState) => void

const DEFAULT_STATE: UIState = {
  status: 'idle',
  currentToolName: '',
  totalInputTokens: 0,
  totalOutputTokens: 0,
  turnCount: 0,
  errorMessage: null,
}

export class UIStateManager {
  private state: UIState = { ...DEFAULT_STATE }
  private listeners = new Set<Listener>()

  getState(): Readonly<UIState> {
    return this.state
  }

  setState(partial: Partial<UIState>): void {
    const prev = this.state
    this.state = { ...prev, ...partial }
    if (this.hasListeners) {
      for (const listener of this.listeners) {
        listener(this.state)
      }
    }
  }

  reset(): void {
    this.setState(DEFAULT_STATE)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private get hasListeners(): boolean {
    return this.listeners.size > 0
  }
}

export function createUIStateManager(): UIStateManager {
  return new UIStateManager()
}
