/**
 * JSON ad-field pruner for the rebuilt YouTube engine (Phase 1 — core).
 *
 * Pure and world-independent: it walks a parsed value and deletes only the
 * configured ad keys, so the player response the page reads no longer carries
 * the ad payload. It is a hardened, testable successor to the serialised
 * MAIN-world prune (`src/content/youtube/prune-main.ts`).
 *
 * Rules:
 *  - only keys listed in `adKeys` are ever deleted;
 *  - a key in `PROTECTED_KEYS` is NEVER deleted, even if also listed in
 *    `adKeys` (protected wins) — those keys carry the video the user must see;
 *  - the walk respects `maxDepth` and `maxKeys`; `overBudget` is set when the
 *    member budget ran out before the walk finished;
 *  - it mutates in place and returns the same reference, and it never throws —
 *    on any error the input is returned with `removed` reported as 0.
 */

export interface PruneLimits {
  /** Deepest object level the walk enters before it stops. */
  readonly maxDepth: number;
  /** Most object members the walk may visit in one pass (a size guard). */
  readonly maxKeys: number;
}

/** Keys that must never be removed, whatever `adKeys` says. */
export const PROTECTED_KEYS: readonly string[] = [
  'streamingData',
  'videoDetails',
  'captions',
  'playabilityStatus',
  'playerConfig',
];

export interface PruneResult {
  readonly value: unknown;
  readonly removed: number;
  readonly overBudget: boolean;
}

export function pruneJson(
  value: unknown,
  adKeys: readonly string[],
  limits: PruneLimits,
): PruneResult {
  const protectedKeys = new Set(PROTECTED_KEYS);
  const ads = new Set(adKeys);
  let removed = 0;
  let budget = limits.maxKeys;
  let overBudget = false;

  function walk(node: unknown, depth: number): void {
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (depth > limits.maxDepth) {
      return;
    }
    if (budget <= 0) {
      overBudget = true;
      return;
    }
    budget -= 1;

    if (Array.isArray(node)) {
      const list = node as unknown[];
      for (let index = 0; index < list.length; index += 1) {
        walk(list[index], depth + 1);
      }
      return;
    }

    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!protectedKeys.has(key) && ads.has(key)) {
        delete record[key];
        removed += 1;
        continue;
      }
      walk(record[key], depth + 1);
    }
  }

  try {
    walk(value, 0);
  } catch {
    // A frozen or throwing object: report no change (fail-open).
    return { value, removed: 0, overBudget: false };
  }
  return { value, removed, overBudget };
}
