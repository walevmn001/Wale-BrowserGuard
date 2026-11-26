/**
 * Every threshold, timeout and cooldown for the rebuilt YouTube engine, in one
 * place (Phase 1 — config layer). Pure constants: importing this module never
 * touches page or extension globals.
 *
 * NOTE: these are **proposed** values. They are UNVERIFIED against a real
 * YouTube session — the descriptive names come from the spec, but the exact
 * numbers must be confirmed empirically (T069) before they are trusted.
 * Bump `TUNING_VERSION` whenever a value changes.
 */

export const TUNING_VERSION = 1;

export const TUNING = {
  /** Deepest level the JSON prune walk descends before it stops. */
  pruneMaxDepth: 6,
  /** Most members the JSON prune walk may visit in one pass (size guard). */
  pruneMaxKeys: 100_000,
  /** Deadline for reading and rewriting a fetch response body. */
  fetchInterceptTimeoutMs: 2_000,
  /** Deadline for rewriting an XHR response body. */
  xhrInterceptTimeoutMs: 2_000,
  /** Minimum gap between ad-detection passes. */
  adDetectThrottleMs: 200,
  /** Tries per ad before any further action is abandoned (no infinite loop). */
  skipMaxAttempts: 3,
  /** Minimum gap between recovery attempts. */
  recoveryCooldownMs: 5_000,
  /** Most recovery attempts before the engine gives up. */
  recoveryMaxRetries: 2,
  /** How often the playback watchdog samples the player. */
  watchdogPollMs: 1_000,
  /** A non-ad video that stops advancing this long is treated as a stall. */
  stallMs: 8_000,
  /** Deadline for restoring the user's audio state after forcing a mute. */
  audioRestoreTimeoutMs: 1_000,
} as const;

export type Tuning = typeof TUNING;
