/**
 * Player response hook (Phase 1 — main layer).
 *
 * Wraps `ytInitialPlayerResponse` on an injected target so the current value
 * and every future assignment are passed through an injected pruner. The target
 * is injected (in production it is the page's `window`, in tests a plain
 * object), so the hook is unit-testable in Node.
 *
 * It is idempotent — a guard key on the target records that the hook is already
 * installed — and fail-open: a locked or hostile property is left exactly as it
 * was, and a throwing pruner falls back to the unpruned value.
 */

import type { FeatureFlags } from '../config/flags';
import type { DebugLogger } from '../core/debug-logger';

export interface PlayerHookTarget {
  ytInitialPlayerResponse?: unknown;
}

export interface PlayerHookOptions {
  readonly flags: FeatureFlags;
  readonly logger: DebugLogger;
  readonly pruner: (value: unknown) => unknown;
  readonly guardKey?: string;
}

/** Default guard key recorded on the target to make installation idempotent. */
export const DEFAULT_PLAYER_HOOK_GUARD = '__wgYtPlayerResponseHook';

const RESPONSE_KEY = 'ytInitialPlayerResponse';

export function installPlayerResponseHook(target: PlayerHookTarget, opts: PlayerHookOptions): void {
  try {
    if (!opts.flags.get('ENABLE_JSON_PRUNER')) {
      return;
    }
    const guardKey = opts.guardKey ?? DEFAULT_PLAYER_HOOK_GUARD;
    const scope = target as unknown as Record<string, unknown>;
    if (scope[guardKey] === true) {
      return;
    }

    const safePrune = (value: unknown): unknown => {
      try {
        return opts.pruner(value);
      } catch {
        return value;
      }
    };

    // Read (never mutate) the current value first; if the property is locked the
    // defineProperty below throws and the value is left exactly as it was.
    const rawCurrent = scope[RESPONSE_KEY];
    let stored: unknown;
    Object.defineProperty(target, RESPONSE_KEY, {
      configurable: true,
      enumerable: true,
      get() {
        return stored;
      },
      set(next: unknown) {
        stored = safePrune(next);
      },
    });
    // Only reached once the accessor is installed: now prune the current value.
    stored = safePrune(rawCurrent);
    scope[guardKey] = true;
  } catch {
    // fail-open: a locked or hostile target is left exactly as it was.
  }
}
