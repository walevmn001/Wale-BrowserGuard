/**
 * Shared domain types.
 *
 * `StorageSchema` is the single source of truth for everything persisted in
 * `chrome.storage`. Later tasks extend it as they add settings, the whitelist
 * and statistics — keeping one typed shape means the storage wrapper stays
 * type-safe without scattering casts around the codebase.
 */
export interface StorageSchema {
  /**
   * Master on/off switch for the whole extension (US-2 / AC-2.3).
   * `true` means blocking is active.
   */
  enabled: boolean;
}
