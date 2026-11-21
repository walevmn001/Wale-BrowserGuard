/**
 * Code-generated rules for the `youtube` static ruleset — T062 (algorithm.md §Q1).
 *
 * Unlike ads/trackers/malware these rules are not converted from a filter list:
 * Q1 blocks the *sub-resource* requests YouTube uses for ads and ad
 * measurement, and the endpoint list is data (`data/youtube-config.json`, Q6),
 * so a YouTube change is fixed by shipping new JSON — never new code.
 *
 * Two endpoints are non-negotiable (algorithm.md §Q1, prompt 11 rule 3):
 *  - the main player JSON API `/youtubei/v1/player` must never be blocked, or
 *    the video stops loading. Only its `ad_break` sub-path is fair game, and a
 *    urlFilter for that sub-path is a strict extension of the player path, so a
 *    plain `/youtubei/v1/player` request can never match it;
 *  - the media-stream hosts (`googlevideo.com`) must never be blocked.
 * `isProtectedEndpoint` re-checks this against the (full) config so a future
 * config update can never sneak a playback endpoint into the block list.
 *
 * Every rule sets no `resourceTypes`, so — like the ad/tracker rulesets — it
 * applies to sub-resources only: a rule that omits it never matches
 * `main_frame`, so navigating to YouTube is never taken down (algorithm.md §B).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PRIORITY } from '../src/shared/constants.ts';
import { isYouTubeConfig, type YouTubeConfig } from '../src/shared/youtube-config.ts';

/** The shipped YouTube module config (relative to the repo root). */
export const YOUTUBE_CONFIG_SOURCE = 'data/youtube-config.json';

/** The player JSON API path that must stay reachable (algorithm.md §Q1). */
export const YOUTUBE_PROTECTED_PATH = '/youtubei/v1/player';

/** Substring of the media-stream hosts that must stay reachable (Q1). */
export const YOUTUBE_PROTECTED_HOST = 'googlevideo';

/**
 * Reads and validates the shipped config, failing the build on a bad shape.
 *
 * TODO(verify): each `endpoints` entry must be confirmed against a real YouTube
 * session (DevTools → Network) — the candidate paths block sub-resources the ad
 * player uses, but only manual testing shows whether blocking any of them
 * disturbs playback. The e2e ("video mock vẫn phát") guards the player API; the
 * full check is T069.
 */
export function loadYouTubeConfig(repoRoot: string): YouTubeConfig {
  const raw: unknown = JSON.parse(readFileSync(resolve(repoRoot, YOUTUBE_CONFIG_SOURCE), 'utf8'));
  if (!isYouTubeConfig(raw)) {
    throw new Error(`${YOUTUBE_CONFIG_SOURCE} failed validation`);
  }
  return raw;
}

/**
 * True for an endpoint the network layer must always allow. The comparison
 * ignores a trailing slash so `/youtubei/v1/player/` is protected as well, while
 * the ad-only `/youtubei/v1/player/ad_break` (a different path) is not.
 */
export function isProtectedEndpoint(endpoint: string): boolean {
  if (endpoint.includes(YOUTUBE_PROTECTED_HOST)) {
    return true;
  }
  return endpoint.replace(/\/+$/, '') === YOUTUBE_PROTECTED_PATH;
}

/**
 * Builds the `youtube` ruleset: one sub-resource block per configured ad
 * endpoint, ids sequential from `startId`. Playback endpoints are dropped
 * defensively even though the shipped config does not contain any.
 */
export function buildYouTubeRules(
  repoRoot: string,
  startId: number,
): chrome.declarativeNetRequest.Rule[] {
  const config = loadYouTubeConfig(repoRoot);
  return config.endpoints
    .filter((endpoint) => !isProtectedEndpoint(endpoint))
    .map((endpoint, index) => ({
      id: startId + index,
      priority: PRIORITY.BLOCK,
      action: { type: 'block' as const },
      // No `resourceTypes`: sub-resource only (see the module header).
      condition: { urlFilter: endpoint },
    }));
}
