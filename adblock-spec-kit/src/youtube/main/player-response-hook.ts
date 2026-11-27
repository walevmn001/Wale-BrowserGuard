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

/**
 * Installs the accessor and prunes the current value. Returns `true` when the
 * hook is (now, or already) in place, `false` when it could not be installed
 * (the flag is off, or the target property is locked). The flag is re-checked
 * on every read/write, so turning `ENABLE_JSON_PRUNER` off stops pruning at
 * once even before the module removes the accessor.
 */
export function installPlayerResponseHook(target: PlayerHookTarget, opts: PlayerHookOptions): boolean {
  try {
    if (!opts.flags.get('ENABLE_JSON_PRUNER')) {
      return false;
    }
    const guardKey = opts.guardKey ?? DEFAULT_PLAYER_HOOK_GUARD;
    const scope = target as unknown as Record<string, unknown>;
    if (scope[guardKey] === true) {
      return true;
    }

    const safePrune = (value: unknown): unknown => {
      try {
        // Authoritative, per-call gate: a saved "off" must stop pruning without
        // waiting for the accessor to be torn down.
        if (!opts.flags.get('ENABLE_JSON_PRUNER')) {
          return value;
        }
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
    return true;
  } catch {
    // fail-open: a locked or hostile target is left exactly as it was.
    return false;
  }
}

/**
 * Removes the accessor, restoring a plain writable property that holds the
 * current value, and clears the guard so a later install starts clean. Fail-open
 * and idempotent: uninstalling a hook that is not installed is a no-op.
 */
export function uninstallPlayerResponseHook(
  target: PlayerHookTarget,
  guardKey: string = DEFAULT_PLAYER_HOOK_GUARD,
): void {
  try {
    const scope = target as unknown as Record<string, unknown>;
    if (scope[guardKey] !== true) {
      return;
    }
    const current = scope[RESPONSE_KEY];
    delete scope[guardKey];
    Object.defineProperty(target, RESPONSE_KEY, {
      value: current,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // fail-open
  }
}
