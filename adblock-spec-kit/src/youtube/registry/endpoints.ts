/**
 * Network endpoint registry for the YouTube engine (Phase 1 — registry layer).
 *
 * Pure data. Two endpoints are non-negotiable (algorithm §Q1): the main player
 * JSON API `/youtubei/v1/player` and the media-stream hosts (`googlevideo`).
 * Blocking either breaks playback, so `isProtected` re-checks every candidate
 * endpoint and the rule builder drops any that touches them.
 */

export interface EndpointRegistry {
  readonly version: number;
  adEndpoints(): readonly string[];
  isProtected(endpoint: string): boolean;
}

export const ENDPOINT_REGISTRY_VERSION = 1;

/** The player JSON API path that must stay reachable (algorithm §Q1). */
export const PROTECTED_PLAYER_PATH = '/youtubei/v1/player';

/** Substring of the media-stream hosts that must stay reachable (algorithm §Q1). */
export const PROTECTED_HOST_FRAGMENT = 'googlevideo';

/** Ad / measurement endpoints that are fair game for a sub-resource block. */
const AD_ENDPOINTS: readonly string[] = [
  '/pagead/',
  '/api/stats/ads',
  '/api/stats/atr',
  '/pcs/activeview',
  '/youtubei/v1/player/ad_break',
];

/**
 * True for an endpoint the network layer must always allow. Trailing slashes
 * are trimmed so `/youtubei/v1/player/` is protected too, while the ad-only
 * sub-path `/youtubei/v1/player/ad_break` (a different path) is not.
 */
export function isProtectedEndpoint(endpoint: string): boolean {
  if (endpoint.includes(PROTECTED_HOST_FRAGMENT)) {
    return true;
  }
  return endpoint.replace(/\/+$/, '') === PROTECTED_PLAYER_PATH;
}

export function createEndpointRegistry(): EndpointRegistry {
  return {
    version: ENDPOINT_REGISTRY_VERSION,
    adEndpoints(): readonly string[] {
      return [...AD_ENDPOINTS];
    },
    isProtected(endpoint: string): boolean {
      return isProtectedEndpoint(endpoint);
    },
  };
}
