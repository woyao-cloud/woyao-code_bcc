export interface ParsedCLIArgs {
  promptArgs: string[]
  resumeRequested: boolean
  resumeSessionId?: string
}

export function parseCLIArgs(rawArgs: string[]): ParsedCLIArgs {
  const promptArgs: string[] = []
  let resumeRequested = false
  let resumeSessionId: string | undefined

  for (const arg of rawArgs) {
    if (arg === '--resume') {
      resumeRequested = true
      continue
    }

    if (arg.startsWith('--resume=')) {
      resumeRequested = true
      const explicitSessionId = arg.slice('--resume='.length).trim()
      if (explicitSessionId) {
        resumeSessionId = explicitSessionId
      }
      continue
    }

    promptArgs.push(arg)
  }

  return {
    promptArgs,
    resumeRequested,
    ...(resumeSessionId ? { resumeSessionId } : {}),
  }
}
