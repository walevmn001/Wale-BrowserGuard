/**
 * Q2 — strip advertising fields from the player response (T063, algorithm.md §Q2).
 *
 * The ad payload YouTube ships alongside the video metadata (`adPlacements`,
 * `playerAds`, `adSlots`, …) is *data* (`data/youtube-config.json` `adFields`,
 * Q6), so a YouTube change is fixed by shipping new JSON, not new code.
 *
 * `installYouTubePrune` runs in the page's **MAIN world** via
 * `chrome.scripting.executeScript({ world: 'MAIN' })`; only there can it wrap
 * the page's own `ytInitialPlayerResponse`, `JSON.parse` and
 * `Response.prototype.json`. Because `executeScript` serialises the function
 * with `Function.prototype.toString()`, the function must be **self-contained**:
 * only its parameters and page globals — no imports and no closure over module
 * scope (see `cosmetic-observer.ts`, and the guard in
 * `tests/unit/youtube-prune.test.ts`).
 *
 * Fail-open is absolute (Constitution VI, prompt 11 rule 1): every step is in a
 * `try/catch`, the recursive prune only ever *deletes* the configured keys and
 * returns the value untouched on any error, and a page that resists wrapping is
 * simply left alone. A broken prune must never be able to break playback.
 */

/** Bounds for the recursive prune (algorithm.md §Q2: depth ≤ 6). */
export interface PruneLimits {
  /** Deepest object level the walk enters before it stops. */
  readonly maxDepth: number;
  /** Most object members the walk may visit in one pass (a size guard). */
  readonly maxKeys: number;
}

/** Conservative defaults: 6 levels deep, 100k members per pass. */
export const YOUTUBE_PRUNE_LIMITS: PruneLimits = {
  maxDepth: 6,
  maxKeys: 100_000,
};

/**
 * Installs the prune hooks in the current page. Idempotent (a second call is a
 * no-op) and fail-open: an error while installing leaves the page as it was.
 * `adFields` are the player-response keys to delete; the values are never
 * touched, only the listed keys (algorithm.md §Q2).
 */
export function installYouTubePrune(adFields: readonly string[], limits: PruneLimits): void {
  const scope = window as unknown as Record<string, unknown>;
  if (scope['__adblockYtPrune'] === true) {
    return;
  }
  scope['__adblockYtPrune'] = true;

  const adKeys = new Set<string>(adFields);
  const budget = { left: limits.maxKeys };

  /** Deletes only `adFields` keys, up to the depth/size limits; else returns `value`. */
  function prune(value: unknown, depth: number): unknown {
    try {
      if (value === null || typeof value !== 'object' || depth > limits.maxDepth) {
        return value;
      }
      if (budget.left <= 0) {
        return value;
      }
      budget.left -= 1;
      if (Array.isArray(value)) {
        const list = value as unknown[];
        for (let index = 0; index < list.length; index += 1) {
          list[index] = prune(list[index], depth + 1);
        }
        return value;
      }
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (adKeys.has(key)) {
          delete record[key];
        } else {
          record[key] = prune(record[key], depth + 1);
        }
      }
      return value;
    } catch {
      // A frozen or throwing object is left exactly as it was (fail-open).
      return value;
    }
  }

  /** Never throws: any failure returns the original value. */
  function pruneRoot(value: unknown): unknown {
    try {
      return prune(value, 0);
    } catch {
      return value;
    }
  }

  // (a) window.ytInitialPlayerResponse — prune the value that is already there
  // and every future assignment.
  try {
    let stored = pruneRoot(scope['ytInitialPlayerResponse']);
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      enumerable: true,
      get() {
        return stored;
      },
      set(next: unknown) {
        stored = pruneRoot(next);
      },
    });
  } catch {
    // A locked property is left untouched.
  }

  // (b) JSON.parse — prune any parsed object that carries an ad field.
  try {
    const json = scope['JSON'] as { parse: (text: string, reviver?: unknown) => unknown } | undefined;
    if (json !== undefined) {
      const original = json.parse;
      json.parse = function (text: string, ...rest: unknown[]): unknown {
        const result = rest.length === 0 ? original(text) : original(text, rest[0]);
        return pruneRoot(result);
      };
    }
  } catch {
    // Wrapping failed: leave JSON.parse exactly as the page had it.
  }

  // (c) Response.prototype.json — same for `fetch()` response bodies.
  try {
    const response = scope['Response'] as
      | { prototype: { json: (...args: unknown[]) => Promise<unknown> } }
      | undefined;
    if (response !== undefined) {
      const original = response.prototype.json;
      response.prototype.json = function (this: unknown, ...args: unknown[]): Promise<unknown> {
        return original.apply(this, args).then((value) => pruneRoot(value));
      };
    }
  } catch {
    // Wrapping failed: leave Response.prototype.json exactly as the page had it.
  }
}
