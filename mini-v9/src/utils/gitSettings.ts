/**
 * Git settings — user-level git config constants for mini-v9.
 */

export const GIT_SETTINGS = {
  /** User name from git config */
  userName: '',
  /** User email from git config */
  userEmail: '',
} as const

/**
 * Read git user config values.
 */
export async function readGitUserConfig(
  cwd: string,
): Promise<{ userName: string; userEmail: string }> {
  const { execFileNoThrow } = await import('./execFileNoThrow.js')

  const [nameResult, emailResult] = await Promise.all([
    execFileNoThrow('git', ['config', 'user.name'], { cwd }),
    execFileNoThrow('git', ['config', 'user.email'], { cwd }),
  ])

  return {
    userName: nameResult.exitCode === 0 ? nameResult.stdout.trim() : '',
    userEmail: emailResult.exitCode === 0 ? emailResult.stdout.trim() : '',
  }
}
