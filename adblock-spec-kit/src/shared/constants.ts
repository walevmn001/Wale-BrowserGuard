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
} as const;

export type PriorityName = keyof typeof PRIORITY;
export type Priority = (typeof PRIORITY)[PriorityName];
