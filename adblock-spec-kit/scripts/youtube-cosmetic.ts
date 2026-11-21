/**
 * Cosmetic element-hiding data for the YouTube module — T064 (algorithm.md §Q3).
 *
 * Q3 hides the ad UI inside the page. The selectors are *data* — the `selectors`
 * list in `data/youtube-config.json` (Q6) — so a YouTube markup change is fixed
 * by shipping new JSON, never new code. This build step turns that list into the
 * same `CosmeticData` shape the core cosmetic pipeline consumes (T020), scoped to
 * `youtube.com`, and emits `rules/cosmetic/youtube.json`. Only the opt-in YouTube
 * module loads the file, so the core cosmetic path is untouched.
 */

import { loadYouTubeConfig } from './youtube-rules.ts';
import { YOUTUBE_COSMETIC_PATH } from '../src/shared/youtube-config.ts';

export { YOUTUBE_COSMETIC_PATH };

export interface YouTubeCosmeticAsset {
  readonly path: string;
  readonly json: string;
  /** How many selectors were emitted (for build logging). */
  readonly selectors: number;
}

/**
 * Builds the module's cosmetic data. Scoping to the `youtube.com` domain keeps
 * the file's intent explicit and lets the shared `selectorsForHost` logic match
 * `www.`/`m.` subdomains; a malformed config fails the build (`loadYouTubeConfig`).
 */
export function buildYouTubeCosmeticAsset(repoRoot: string): YouTubeCosmeticAsset {
  const { selectors } = loadYouTubeConfig(repoRoot);
  const data = {
    generic: { selectors: [], exceptions: [] },
    domains: { 'youtube.com': { selectors: [...selectors], exceptions: [] } },
  };
  return {
    path: YOUTUBE_COSMETIC_PATH,
    json: `${JSON.stringify(data, null, 2)}\n`,
    selectors: selectors.length,
  };
}
