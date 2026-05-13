import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/**
 * Execute a file without throwing on non-zero exit codes
 */
export async function execFileNoThrow(
  command: string,
  args?: string[],
  options?: { cwd?: string; timeout?: number; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync(command, args ?? [], {
      ...options,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf-8',
    })
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 }
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: execErr.stdout ?? '',
      stderr: execErr.stderr ?? '',
      exitCode: execErr.code ?? 1,
    }
  }
}
