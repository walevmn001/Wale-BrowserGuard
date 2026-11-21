/**
 * Shared constants.
 *
 * DNR rule priorities are defined once here and imported everywhere — never
 * hard-coded at call sites (see algorithm.md §A). Bigger number wins.
 */
export const PRIORITY = {
  /** User whitelist: let every request on the site through. */
  WHITELIST_ALLOW_ALL: 1000,
  /** Malware / phishing block: highest block authority, just under whitelist. */
  MALWARE_BLOCK: 900,
  /** Filter-list exception (`@@`): allow even if another rule blocks. */
  EXCEPTION_ALLOW: 800,
  /** Regular ad / tracker block. */
  BLOCK: 500,
  /** http → https upgrade. */
  UPGRADE_SCHEME: 300,
  /** Strip tracking parameters from the URL. */
  REMOVE_PARAM: 200,
  /** Trim the Referer header on third-party requests. */
  REFERER_POLICY: 200,
} as const;

export type PriorityName = keyof typeof PRIORITY;
export type Priority = (typeof PRIORITY)[PriorityName];

/**
 * The opt-in YouTube module's static ruleset id (Q1). The module toggles it for
 * its own switch, and the Q6 kill-switch disables it via
 * `updateEnabledRulesets`.
 */
export const YOUTUBE_RULESET_ID = 'youtube';

/**
 * Static ruleset ids whose enabled state is owned by an isolated, opt-in module
 * instead of the master switch (AC-15.1). The YouTube module (`youtube`) is off
 * until the user turns it on, so the master switch must never enable it for
 * someone who never opted in — the module publishes its own switch and the
 * service worker toggles the ruleset from that.
 */
export const MODULE_OWNED_RULESETS: readonly string[] = [YOUTUBE_RULESET_ID];
