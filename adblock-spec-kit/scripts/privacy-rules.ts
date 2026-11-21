/**
 * Code-generated rules for the `privacy` static ruleset (algorithm.md §G).
 *
 * Unlike ads/trackers/malware these rules are not derived from a filter list:
 * they are structural — the https-scheme upgrade and the tracking-parameter
 * strip below — so they are built in code and merged into the packaged
 * `privacy` ruleset by `build-rulesets.ts`.
 *
 * Reference: developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
 * — the `upgradeScheme` action rewrites an `http`/`ftp` request to `https`, and
 * the `redirect` action's `transform.queryTransform.removeParams` drops query
 * keys (matched case-insensitively) from the request URL.
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

/**
 * Campaign parameters Google defines with the `utm_` prefix. DNR `removeParams`
 * takes exact keys (no wildcard), so the `utm_*` family is enumerated here.
 */
export const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',
  'utm_campaign_id',
  'utm_adgroup',
  'utm_adid',
  'utm_keyword',
  'utm_matchtype',
  'utm_network',
  'utm_device',
  'utm_placement',
  'utm_creative',
  'utm_target',
  'utm_referrer',
  'utm_reader',
  'utm_viz_id',
] as const;

/** Click identifiers, email-marketing tags and analytics linkers (algorithm.md §G). */
export const TRACKING_ID_PARAMS = [
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'igshid',
  'li_fat_id',
  'rb_clickid',
  'vero_id',
  'wickedid',
  'oly_enc_id',
  'oly_anon_id',
  'mc_eid',
  'mc_cid',
  'mkt_tok',
  's_cid',
  '_ga',
  '_gl',
] as const;

/** Every query key the privacy ruleset strips, kept as fixed data (algorithm.md §G). */
export const TRACKING_PARAMS: readonly string[] = [...UTM_PARAMS, ...TRACKING_ID_PARAMS];

/**
 * The strip rule's condition: a deliberately cheap prefilter for "URL carries a
 * query string". Spelling the whole key list out in `regexFilter` is not an
 * option — the 44-key alternation makes RE2 answer `memoryLimitExceeded` to
 * `chrome.declarativeNetRequest.isRegexSupported` — so the exact matching is
 * left to `removeParams` itself. A URL whose keys are all unknown is rewritten
 * to the identical URL, and DNR skips a redirect that changes nothing, so such
 * a request is never disturbed (and the rule cannot loop).
 */
export const TRACKING_QUERY_REGEX = '[?&]';

/**
 * Every DNR resource type. The strip rule lists them all explicitly because a
 * rule that omits `resourceTypes` does not match top-level navigations — DNR's
 * default set leaves `main_frame` out — so a tracking query string would survive
 * on the address bar. Listing the set (including `main_frame`) is what lets one
 * rule clean both the tracking pixels and the navigation.
 */
export const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
] as const;

/**
 * The referer rule targets sub-resources, not top-level navigations. Dropping
 * the header a page sends while loading its own resources is a small step past
 * the browser default (`strict-origin-when-cross-origin` already strips the
 * path cross-site), but doing the same on a navigation can blank out login
 * redirects and hotlink checks — "chặn thiếu hơn chặn nhầm".
 *
 * The rule itself now ships as a *dynamic* rule (`src/background/referer.ts`) so
 * the user can turn referer trimming off on its own; only the resource-type
 * list stays here as shared reference data.
 */
export const REFERER_RESOURCE_TYPES = ALL_RESOURCE_TYPES.filter(
  (type) => type !== 'main_frame',
);

/**
 * Builds the `privacy` ruleset: the https upgrade and the tracking-parameter
 * strip. Referer trimming moved to a dynamic rule (see above), so the ids are
 * sequential from `startId` across two rules.
 */
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
    {
      id: startId + 1,
      priority: PRIORITY.REMOVE_PARAM,
      action: {
        type: 'redirect',
        redirect: { transform: { queryTransform: { removeParams: [...TRACKING_PARAMS] } } },
      },
      condition: { regexFilter: TRACKING_QUERY_REGEX, resourceTypes: [...ALL_RESOURCE_TYPES] },
    },
  ];
}
