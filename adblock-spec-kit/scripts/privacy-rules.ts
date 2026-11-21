/**
 * Code-generated rules for the `privacy` static ruleset (algorithm.md §G).
 *
 * Unlike ads/trackers/malware these rules are not derived from a filter list:
 * they are structural (the https-scheme upgrade here; tracking-parameter
 * stripping lands with T033), so they are built in code and merged into the
 * packaged `privacy` ruleset by `build-rulesets.ts`.
 *
 * Reference: developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
 * — the `upgradeScheme` action rewrites an `http`/`ftp` request to `https`.
 */

import { PRIORITY } from '../src/shared/constants.ts';

/**
 * Matches an insecure request to a public-looking host: `http://` followed by a
 * dotted name whose last label is at least two ASCII letters. Everything else is
 * deliberately left alone (algorithm.md §G):
 *  - `https://…` is not matched (the anchor is on `http://`), so an upgraded
 *    request never matches again and the rule cannot loop;
 *  - `localhost` and other bare hostnames have no dot and are skipped;
 *  - IP literals (`127.0.0.1`, `10.0.0.5`, `192.168.1.1`, `[::1]`) are skipped
 *    because a purely numeric last label never satisfies `[a-z]{2,}`.
 * Chromium canonicalises the URL (lower-cased scheme and host) before matching,
 * which is why the pattern can assume lower case.
 */
export const UPGRADE_SCHEME_REGEX = '^http://(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}';

/**
 * The upgrade skips navigations. A DNR `upgradeScheme` has no https→http
 * fallback, so upgrading a top-level document would permanently break an
 * http-only site — the opposite of "chặn thiếu hơn chặn nhầm". Restricting the
 * rule to sub-resources keeps the benefit (no more insecure mixed content)
 * without ever taking a page down; the user whitelist (`allowAllRequests` at
 * priority 1000) is the escape hatch for a site that is still broken.
 */
export const UPGRADE_EXCLUDED_RESOURCE_TYPES = ['main_frame', 'sub_frame'] as const;

/** Builds the privacy rules, numbering ids from `startId`. */
export function buildPrivacyRules(startId: number): chrome.declarativeNetRequest.Rule[] {
  return [
    {
      id: startId,
      priority: PRIORITY.UPGRADE_SCHEME,
      action: { type: 'upgradeScheme' },
      condition: {
        regexFilter: UPGRADE_SCHEME_REGEX,
        excludedResourceTypes: [...UPGRADE_EXCLUDED_RESOURCE_TYPES],
      },
    },
  ];
}
