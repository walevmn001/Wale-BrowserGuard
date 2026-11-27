import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FLAGS, FeatureFlags, type FlagName } from '../../../src/youtube/config/flags';
import { DebugLogger } from '../../../src/youtube/core/debug-logger';
import {
  DEFAULT_PLAYER_HOOK_GUARD,
  installPlayerResponseHook,
  type PlayerHookTarget,
} from '../../../src/youtube/main/player-response-hook';

const RESPONSE_KEY = 'ytInitialPlayerResponse';

function makeFlags(overrides: Partial<Record<FlagName, boolean>> = {}): FeatureFlags {
  const defaults: Record<FlagName, boolean> = { ...DEFAULT_FLAGS, ...overrides };
  return new FeatureFlags(defaults);
}

/** A pruner that returns a shallow copy without `adPlacements`. */
function stripAds(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  delete copy['adPlacements'];
  return copy;
}

function scopeOf(target: PlayerHookTarget): Record<string, unknown> {
  return target as unknown as Record<string, unknown>;
}

describe('installPlayerResponseHook', () => {
  it('prunes the current value on install', () => {
    const target: PlayerHookTarget = { ytInitialPlayerResponse: { adPlacements: [1], keep: true } };

    installPlayerResponseHook(target, {
      flags: makeFlags(),
      logger: new DebugLogger(),
      pruner: stripAds,
    });

    expect(scopeOf(target)[RESPONSE_KEY]).toEqual({ keep: true });
  });

  it('prunes every future assignment', () => {
    const target: PlayerHookTarget = {};
    installPlayerResponseHook(target, {
      flags: makeFlags(),
      logger: new DebugLogger(),
      pruner: stripAds,
    });

    scopeOf(target)[RESPONSE_KEY] = { adPlacements: [2], keep: false };

    expect(scopeOf(target)[RESPONSE_KEY]).toEqual({ keep: false });
  });

  it('is idempotent — a second install does not re-wrap or re-run the pruner', () => {
    const pruner = vi.fn(stripAds);
    const target: PlayerHookTarget = { ytInitialPlayerResponse: { adPlacements: [] } };
    const opts = { flags: makeFlags(), logger: new DebugLogger(), pruner };

    installPlayerResponseHook(target, opts);
    installPlayerResponseHook(target, opts);

    expect(pruner).toHaveBeenCalledTimes(1);
    expect(scopeOf(target)[DEFAULT_PLAYER_HOOK_GUARD]).toBe(true);
  });

  it('does nothing when the flag is off', () => {
    const pruner = vi.fn(stripAds);
    const value = { adPlacements: [] };
    const target: PlayerHookTarget = { ytInitialPlayerResponse: value };

    installPlayerResponseHook(target, {
      flags: makeFlags({ ENABLE_JSON_PRUNER: false }),
      logger: new DebugLogger(),
      pruner,
    });

    expect(scopeOf(target)[RESPONSE_KEY]).toBe(value);
    expect(pruner).not.toHaveBeenCalled();
    expect(scopeOf(target)[DEFAULT_PLAYER_HOOK_GUARD]).toBeUndefined();
  });

  it('leaves a locked property exactly as it was', () => {
    const value = { adPlacements: [] };
    const target = {} as PlayerHookTarget;
    Object.defineProperty(target, RESPONSE_KEY, {
      value,
      configurable: false,
      writable: false,
      enumerable: true,
    });
    const pruner = vi.fn(stripAds);

    installPlayerResponseHook(target, {
      flags: makeFlags(),
      logger: new DebugLogger(),
      pruner,
    });

    expect(scopeOf(target)[RESPONSE_KEY]).toBe(value);
    expect(pruner).not.toHaveBeenCalled();
    expect(scopeOf(target)[DEFAULT_PLAYER_HOOK_GUARD]).toBeUndefined();
  });

  it('falls back to the unpruned value when the pruner throws', () => {
    const value = { adPlacements: [] };
    const target: PlayerHookTarget = { ytInitialPlayerResponse: value };
    const pruner = vi.fn(() => {
      throw new Error('boom');
    });

    installPlayerResponseHook(target, {
      flags: makeFlags(),
      logger: new DebugLogger(),
      pruner,
    });

    expect(scopeOf(target)[RESPONSE_KEY]).toBe(value);
  });

  it('honours a custom guard key', () => {
    const target: PlayerHookTarget = {};

    installPlayerResponseHook(target, {
      flags: makeFlags(),
      logger: new DebugLogger(),
      pruner: stripAds,
      guardKey: '__customGuard',
    });

    expect(scopeOf(target)['__customGuard']).toBe(true);
  });

  it('returns a handle on success and undefined when the flag is off', () => {
    const on: PlayerHookTarget = {};
    const handle = installPlayerResponseHook(on, {
      flags: makeFlags(),
      logger: new DebugLogger(),
      pruner: stripAds,
    });
    expect(typeof handle?.uninstall).toBe('function');

    const off: PlayerHookTarget = {};
    const none = installPlayerResponseHook(off, {
      flags: makeFlags({ ENABLE_JSON_PRUNER: false }),
      logger: new DebugLogger(),
      pruner: stripAds,
    });
    expect(none).toBeUndefined();
  });

  it('stops pruning the moment the flag flips off, and resumes when it flips on', () => {
    const flags = makeFlags();
    const target: PlayerHookTarget = {};
    installPlayerResponseHook(target, { flags, logger: new DebugLogger(), pruner: stripAds });

    // Flag ON: a future assignment is pruned.
    scopeOf(target)[RESPONSE_KEY] = { adPlacements: [1], keep: true };
    expect(scopeOf(target)[RESPONSE_KEY]).toEqual({ keep: true });

    // Flag OFF at runtime: the very next assignment must pass through untouched.
    flags.applyRemote({
      schemaVersion: 1,
      flags: { ...DEFAULT_FLAGS, ENABLE_JSON_PRUNER: false },
    });
    const raw = { adPlacements: [2], keep: false };
    scopeOf(target)[RESPONSE_KEY] = raw;
    expect(scopeOf(target)[RESPONSE_KEY]).toBe(raw);

    // Flag back ON: pruning resumes on the next assignment.
    flags.applyRemote({ schemaVersion: 1, flags: { ...DEFAULT_FLAGS } });
    scopeOf(target)[RESPONSE_KEY] = { adPlacements: [3], keep: true };
    expect(scopeOf(target)[RESPONSE_KEY]).toEqual({ keep: true });
  });

  it('uninstall restores a plain, writable data property', () => {
    const target: PlayerHookTarget = {};
    const handle = installPlayerResponseHook(target, {
      flags: makeFlags(),
      logger: new DebugLogger(),
      pruner: stripAds,
    });

    scopeOf(target)[RESPONSE_KEY] = { adPlacements: [1], keep: true };
    handle?.uninstall();

    const descriptor = Object.getOwnPropertyDescriptor(target, RESPONSE_KEY);
    expect(descriptor?.set).toBeUndefined();
    expect(descriptor?.writable).toBe(true);
    expect(scopeOf(target)[DEFAULT_PLAYER_HOOK_GUARD]).toBeUndefined();

    // The page can still assign without the accessor in the way.
    const raw = { keep: 'untouched' };
    scopeOf(target)[RESPONSE_KEY] = raw;
    expect(scopeOf(target)[RESPONSE_KEY]).toBe(raw);
  });
});
