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
 *
 * FIX-01: the flag is now checked *at prune time*, not only at install time, so
 * turning the JSON pruner off stops the pruning on the live page immediately
 * even if the accessor is still in place. Installing with the flag off is a
 * no-op (the caller reconciles by calling again when it flips on), and the
 * returned handle can uninstall the accessor cleanly.
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

/** Handle returned by a successful install; `uninstall` restores the target. */
export interface PlayerHookHandle {
  uninstall(): void;
}

/** Default guard key recorded on the target to make installation idempotent. */
export const DEFAULT_PLAYER_HOOK_GUARD = '__wgYtPlayerResponseHook';

const RESPONSE_KEY = 'ytInitialPlayerResponse';

function isHandle(value: unknown): value is PlayerHookHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { uninstall?: unknown }).uninstall === 'function'
  );
}

export function installPlayerResponseHook(
  target: PlayerHookTarget,
  opts: PlayerHookOptions,
): PlayerHookHandle | undefined {
  try {
    const guardKey = opts.guardKey ?? DEFAULT_PLAYER_HOOK_GUARD;
    const handleKey = `${guardKey}Handle`;
    const scope = target as unknown as Record<string, unknown>;

    // Idempotent: a second install returns the live handle without re-wrapping.
    const existing = scope[handleKey];
    if (scope[guardKey] === true && isHandle(existing)) {
      return existing;
    }

    // Installing with the flag off is a no-op: the caller re-installs when the
    // flag flips on. This keeps "off" free of any page mutation.
    if (!opts.flags.get('ENABLE_JSON_PRUNER')) {
      return undefined;
    }

    const safePrune = (value: unknown): unknown => {
      try {
        // Re-checked on every assignment: an OFF flag stops pruning at once.
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

    const handle: PlayerHookHandle = {
      uninstall(): void {
        try {
          // Re-materialise the latest value as a plain data property so a later
          // assignment from the page keeps working without our accessor.
          Object.defineProperty(target, RESPONSE_KEY, {
            value: stored,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch {
          // fail-open: leave the accessor in place if it cannot be replaced.
        }
        delete scope[guardKey];
        delete scope[handleKey];
      },
    };
    scope[handleKey] = handle;
    return handle;
  } catch {
    // fail-open: a locked or hostile target is left exactly as it was.
    return undefined;
  }
}
