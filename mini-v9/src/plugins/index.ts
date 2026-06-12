export * from './types.js'
export * from './pluginLoader.js'
export * from './pluginInstaller.js'
export * from './marketplaceManager.js'
export * from './pluginSecurity.js'
export * from './pluginLifecycle.js'
export * from './pluginSubsystems.js'

// Re-export unique schema exports (skip types that exist in types.ts)
export {
  OFFICIAL_MARKETPLACE_NAME,
  BLOCKED_OFFICIAL_NAME_PATTERN,
  validateMarketplaceName,
  isMarketplaceAutoUpdate,
  validatePluginManifest,
  getMarketplaceSourceDisplay,
  NO_AUTO_UPDATE_OFFICIAL_MARKETPLACES,
} from './schemas.js'
export type {
  MarketplaceSource,
  PluginValidationResult,
} from './schemas.js'
