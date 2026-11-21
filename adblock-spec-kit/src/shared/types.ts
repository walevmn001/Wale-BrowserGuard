import type { YouTubeConfig } from './youtube-config';

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

/** Protection profiles (Phase 9 §1). `custom` is the user's own mix. */
export type ProtectionProfileId = 'balanced' | 'strict' | 'custom';

/** UI theme choice; `system` follows the OS. */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** UI language choice; `auto` follows the browser UI language. */
export type LanguageChoice = 'auto' | 'vi' | 'en';

/** Which events may raise a desktop notification (Phase 9 §9). */
export interface NotificationSettings {
  readonly filterUpdate: boolean;
  readonly securityBlock: boolean;
  readonly protectionOff: boolean;
  readonly errors: boolean;
}

/** Block-reason bucket derived from the ruleset that matched. */
export type BlockCategory = 'ads' | 'trackers' | 'malware' | 'privacy' | 'other';

/**
 * One local record of a blocked request (Phase 4). DNR's `getMatchedRules` does
 * not expose the blocked URL, so a record carries what the browser *does*
 * report — the matching ruleset/rule, the tab and the time — plus the page host
 * resolved at poll time. Never leaves the machine.
 */
export interface ActivityEntry {
  /** Page host that the request came from, or `''` when it could not be read. */
  readonly host: string;
  readonly category: BlockCategory;
  readonly rulesetId: string;
  readonly ruleId: number;
  readonly tabId: number;
  readonly timeStamp: number;
}

/** A user-authored rule (Phase 9 §5). Validated before it is applied. */
export interface CustomRule {
  readonly id: string;
  readonly text: string;
  readonly enabled: boolean;
}

/** Referer trimming policy (Phase 8). */
export type RefererPolicy = 'default' | 'third-party';

/**
 * The settings groups that may sync between devices (US-16 / AC-16.2, T081).
 * Statistics, the activity log and history are deliberately not in here — only
 * configuration ever leaves the machine.
 */
export type SettingsSyncGroup = 'settings' | 'whitelist' | 'customSelectors';

/** Per-group "last changed" timestamps used for conflict resolution (T081). */
export interface SettingsSyncMeta {
  readonly settings: number;
  readonly whitelist: number;
  readonly customSelectors: number;
}

/**
 * Session-scoped YouTube health degrade state (US-15 / AC-15.4, T066).
 *
 * Kept in `chrome.storage.session`, so a degrade lasts only for the browser
 * session and the module is never left permanently off. `q2Disabled` drops the
 * Q2 prune for the session; `moduleDisabled` turns the whole module off.
 */
export interface YouTubeHealthSessionState {
  readonly q2Disabled: boolean;
  readonly moduleDisabled: boolean;
  /** Fault timestamps (ms since epoch) inside the recent window. */
  readonly faults: number[];
}

/** A user-added filter-list URL (Phase 5). Stored metadata only in v1. */
export interface CustomList {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly enabled: boolean;
  /** Rule count once downloaded and validated, when known. */
  readonly rules?: number;
  /** Last successful download, ms since epoch, when known. */
  readonly updatedAt?: number;
}

/**
 * Per-domain overrides (Phase 9 §3).
 *
 * Only the settings DNR can actually scope per site live here: cosmetic
 * element-hiding can be turned off for one site, and the whitelist (a separate
 * key) exempts a site entirely. Network block lists are global — DNR cannot
 * disable one list for one host — so they are deliberately not modelled here.
 */
export interface SiteSetting {
  /** Turn cosmetic (element-hiding) filtering off for this site. */
  readonly cosmeticOff?: boolean;
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
  /**
   * Opt-in WebRTC leak protection (US-6 / AC-6.4, T035). `true` means WebRTC is
   * kept on the public interface; off (the default) leaves Chrome untouched.
   */
  webrtcProtection: boolean;
  /**
   * Opt-in basic anti-fingerprinting (US-6 / AC-6.5, T036). `false` (the
   * default) means the reducer never runs, because spoofing the page's own
   * objects is the easiest way to break a site.
   */
  antiFingerprint: boolean;
  /**
   * Hosts where anti-fingerprinting is switched off — the per-page quick
   * switch (US-6 / AC-6.5, T036); missing means it runs everywhere it is on.
   */
  antiFingerprintOffSites: string[];
  /**
   * When temporary protection pause lapses, ms since epoch. Absent, or at/below
   * the current time, means protection is running normally (Phase 9 §2).
   */
  pausedUntil?: number;
  /** Selected protection profile; missing means `balanced` (Phase 9 §1). */
  profile?: ProtectionProfileId;
  /** UI language; missing means `auto` (follow the browser). */
  language?: LanguageChoice;
  /** UI theme; missing means `system`. */
  theme?: ThemeChoice;
  /** Notification preferences; missing means every event is off. */
  notifications?: NotificationSettings;
  /** Local block log, newest first, capped (Phase 4). */
  activity?: ActivityEntry[];
  /** How long activity records are kept, in days (Phase 4). */
  activityRetentionDays?: number;
  /** User-authored rules (Phase 9 §5). */
  customRules?: CustomRule[];
  /** Per-domain overrides keyed by host (Phase 9 §3). */
  siteSettings?: Record<string, SiteSetting>;
  /**
   * Locally hidden elements keyed by host — selectors the element picker saved
   * (Phase 9 §4). Injected as element-hiding CSS on top of the shipped lists.
   */
  hiddenSelectors?: Record<string, string[]>;
  /**
   * Hosts where the user chose "trust this site" on the in-page security banner
   * (Phase 7), so it never shows there again; missing means none.
   */
  bannerTrusted?: string[];
  /** Referer trimming policy; missing means the browser default (Phase 8). */
  refererPolicy?: RefererPolicy;
  /** Blocked-request counts per category since install (Phase 4). */
  statsCategories?: Record<string, number>;
  /** Local date (`YYYY-MM-DD`) the `statsToday` counter belongs to. */
  statsTodayDate?: string;
  /** Blocked requests on `statsTodayDate` (Phase 4). */
  statsToday?: number;
  /** User-added filter-list URLs (Phase 5). */
  customLists?: CustomList[];
  /**
   * YouTube module master switch (US-15 / AC-15.1, T060). `false` (the default)
   * means the isolated, best-effort module never runs: no network rules, no
   * MAIN-world script, no cosmetic CSS on YouTube.
   */
  youtubeModule?: boolean;
  /**
   * YouTube module session health flags (US-15 / AC-15.4, T066). Stored in
   * `chrome.storage.session`; missing means the module is healthy this session.
   */
  youtubeHealthSession?: YouTubeHealthSessionState;
  /**
   * The updated YouTube module config (US-15 / AC-15.6, Q6 / T067). When a
   * newer, schema-valid config was downloaded it is stored here and the module
   * prefers it over the packaged file — this is also how a remote `enabled:false`
   * kill-switch reaches every user. Missing means "use the packaged config".
   */
  youtubeConfigActive?: YouTubeConfig;
  /**
   * Opt-in settings sync (US-16 / AC-16.2, T081). `false` (the default) means
   * nothing is ever written to `chrome.storage.sync` and no remote change is
   * applied. Only configuration groups sync ({@link SettingsSyncGroup}) —
   * statistics, activity and history never leave the machine.
   */
  settingsSync?: boolean;
  /**
   * Per-group "last changed" timestamps for sync conflict resolution (T081).
   * Local metadata; never itself synced. Missing means every group is at 0.
   */
  settingsSyncMeta?: SettingsSyncMeta;
}
