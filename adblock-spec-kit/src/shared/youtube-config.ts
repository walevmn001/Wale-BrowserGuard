/**
 * YouTube module configuration schema + validator — T060 (US-15, algorithm.md §Q).
 *
 * The module's volatile parts — which player-response keys carry ads, the ad
 * request paths, the CSS selectors and the skip-button selectors — are *data*,
 * not code (Constitution 26). They ship in `data/youtube-config.json` and can
 * be replaced atomically through the filter updater (Q6), so a YouTube change is
 * fixed by shipping new JSON, never new code.
 *
 * Everything the module reads is treated as untrusted input: `isYouTubeConfig`
 * rejects a shape that is not exactly what the module expects and bounds every
 * list and value (Constitution 9), so a corrupt or oversized download can never
 * be swapped in. The schema mirrors algorithm.md §Q:
 *   { version, enabled, layers, adFields, endpoints, selectors, skipSelectors }
 */

/** Which of the five in-page layers may run (Q1–Q5; Q6 is transport, not a layer). */
export interface YouTubeLayerFlags {
  /** Q1 — block ad / measurement endpoints with declarativeNetRequest. */
  readonly network: boolean;
  /** Q2 — strip ad fields from the player response (MAIN world). */
  readonly prune: boolean;
  /** Q3 — hide ad UI with injected CSS. */
  readonly cosmetic: boolean;
  /** Q4 — skip / fast-forward an ad that still plays. */
  readonly skip: boolean;
  /** Q5 — watch playback health and degrade the module when it breaks. */
  readonly health: boolean;
}

/** The shipped / updatable YouTube module configuration (algorithm.md §Q). */
export interface YouTubeConfig {
  /** Monotonic schema/content version; a newer number wins on update (Q6). */
  readonly version: number;
  /** Kill-switch: `false` disables the whole module for every user (Q6). */
  readonly enabled: boolean;
  readonly layers: YouTubeLayerFlags;
  /** Player-response keys that carry advertising (e.g. `adPlacements`). */
  readonly adFields: readonly string[];
  /** Ad / measurement request paths the network layer may block. */
  readonly endpoints: readonly string[];
  /** CSS selectors that hide ad UI. */
  readonly selectors: readonly string[];
  /** Selectors for an ad's skip button. */
  readonly skipSelectors: readonly string[];
}

/**
 * Where the shipped configuration lives inside the built extension. The build
 * copies `data/youtube-config.json` to this path (T063) and the worker reads it
 * at runtime, exactly like the cosmetic data files (algorithm.md §Q6).
 */
export const YOUTUBE_CONFIG_PATH = 'data/youtube-config.json';

/** The layer flag names, kept here so the guard and any UI iterate the same set. */
export const YOUTUBE_LAYER_KEYS = [
  'network',
  'prune',
  'cosmetic',
  'skip',
  'health',
] as const satisfies readonly (keyof YouTubeLayerFlags)[];

/** Ceilings enforced on every value (Constitution 9 — bound untrusted input). */
export const YOUTUBE_CONFIG_MAX = {
  version: 1_000_000,
  adFields: 64,
  endpoints: 512,
  selectors: 2_000,
  skipSelectors: 256,
  /** Longest single field name / selector / endpoint string. */
  itemLength: 512,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A positive integer version within the accepted range. */
function isVersion(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= YOUTUBE_CONFIG_MAX.version
  );
}

/** Every known layer flag present and boolean; unknown extra keys are ignored. */
function isLayerFlags(value: unknown): value is YouTubeLayerFlags {
  if (!isRecord(value)) {
    return false;
  }
  return YOUTUBE_LAYER_KEYS.every((key) => typeof value[key] === 'boolean');
}

/** A non-empty string list of at most `max` items, each within the length cap. */
function isStringList(value: unknown, max: number): value is string[] {
  if (!Array.isArray(value) || value.length > max) {
    return false;
  }
  return value.every(
    (item) =>
      typeof item === 'string' &&
      item.length > 0 &&
      item.length <= YOUTUBE_CONFIG_MAX.itemLength,
  );
}

/**
 * Runtime guard for the packaged or downloaded YouTube configuration. Returns
 * `true` only for a fully well-formed object; the module treats a `false` as
 * "ignore this config and keep the current one" (Q6, fail-safe).
 */
export function isYouTubeConfig(value: unknown): value is YouTubeConfig {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isVersion(value['version']) &&
    typeof value['enabled'] === 'boolean' &&
    isLayerFlags(value['layers']) &&
    isStringList(value['adFields'], YOUTUBE_CONFIG_MAX.adFields) &&
    isStringList(value['endpoints'], YOUTUBE_CONFIG_MAX.endpoints) &&
    isStringList(value['selectors'], YOUTUBE_CONFIG_MAX.selectors) &&
    isStringList(value['skipSelectors'], YOUTUBE_CONFIG_MAX.skipSelectors)
  );
}
