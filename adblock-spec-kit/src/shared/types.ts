/** One validated group inside the active filter set (US-7 / T023). */
export interface FilterGroupInfo {
  readonly bytes: number;
  readonly rules: number;
  readonly checksum: string;
}

/** The newest fully-validated filter set; swapped in atomically (US-7). */
export interface FilterActiveSnapshot {
  readonly updatedAt: number;
  readonly groups: Record<string, FilterGroupInfo>;
}

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
   * Static ruleset ids the user switched off (US-7 / T024). The master switch
   * stays on; these groups just do not run. Missing means every group is on.
   */
  disabledRuleSets: string[];
  /**
   * Domains the user has whitelisted (US-2 / AC-2.2). Stored even though the
   * matching dynamic rules also persist in the browser, so the list survives a
   * restart and can be shown/edited by the popup.
   */
  whitelist: string[];
  /**
   * Temporary malware exceptions from the warning page's "continue anyway"
   * button: host -> expiry time (ms since epoch). Cleared when a host lapses
   * (US-5 / AC-5.2, T031); missing means none.
   */
  tempExceptions: Record<string, number>;
  /** Total blocked requests since install (US-3 / AC-3.1). */
  statsTotal: number;
  /** Blocked requests per tab; keys are stringified tab ids (US-3 / AC-3.1). */
  statsByTab: Record<string, number>;
  /**
   * Newest matched-rule timestamp already counted. Used as the `getMatchedRules`
   * cursor so a match is never counted twice (US-3 / AC-3.2 keeps it local).
   */
  statsCursor: number;
  /**
   * Descriptor of the active filter set, absent until the first successful
   * update. A failed update never overwrites it (US-7 / AC-7.2).
   */
  filterActive?: FilterActiveSnapshot;
  /** Consecutive failed updates; drives the retry backoff (US-7 / AC-7.2). */
  filterFailures: number;
  /** When the next update attempt is due, ms since epoch (US-7 / AC-7.1). */
  filterNextAttemptAt: number;
}
