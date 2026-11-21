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
  /**
   * Domains the user has whitelisted (US-2 / AC-2.2). Stored even though the
   * matching dynamic rules also persist in the browser, so the list survives a
   * restart and can be shown/edited by the popup.
   */
  whitelist: string[];
  /** Total blocked requests since install (US-3 / AC-3.1). */
  statsTotal: number;
  /** Blocked requests per tab; keys are stringified tab ids (US-3 / AC-3.1). */
  statsByTab: Record<string, number>;
  /**
   * Newest matched-rule timestamp already counted. Used as the `getMatchedRules`
   * cursor so a match is never counted twice (US-3 / AC-3.2 keeps it local).
   */
  statsCursor: number;
}
