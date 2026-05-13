/**
 * Get the current platform (win32, darwin, linux)
 */
export function getPlatform(): NodeJS.Platform {
  return process.platform
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32'
}
