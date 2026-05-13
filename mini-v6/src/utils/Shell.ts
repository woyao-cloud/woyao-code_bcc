/**
 * Set the current working directory
 */
export function setCwd(path: string): void {
  process.chdir(path)
}

/**
 * Get the default shell for the platform
 */
export function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe'
  }
  return process.env.SHELL || '/bin/bash'
}
