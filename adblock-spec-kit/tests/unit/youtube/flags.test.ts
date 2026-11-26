import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_FLAGS,
  FeatureFlags,
  FLAG_NAMES,
  FLAG_SCHEMA_VERSION,
  type FlagName,
} from '../../../src/youtube/config/flags';

/** A full, valid flags record (all ON unless overridden). */
function flagsRecord(overrides: Partial<Record<FlagName, boolean>> = {}): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const name of FLAG_NAMES) {
    flags[name] = overrides[name] ?? true;
  }
  return flags;
}

describe('FeatureFlags — defaults', () => {
  it('returns the default value for every flag before any snapshot', () => {
    const flags = new FeatureFlags();
    for (const name of FLAG_NAMES) {
      expect(flags.get(name)).toBe(DEFAULT_FLAGS[name]);
      expect(flags.get(name)).toBe(true);
    }
  });

  it('reports the default snapshot shape and source', () => {
    const flags = new FeatureFlags();
    const snapshot = flags.snapshot();
    expect(snapshot.schemaVersion).toBe(FLAG_SCHEMA_VERSION);
    expect(snapshot.source).toBe('default');
    expect(Object.keys(snapshot.flags)).toHaveLength(FLAG_NAMES.length);
  });
});

describe('FeatureFlags — unknown flag names', () => {
  it('returns false and warns once per distinct unknown name', () => {
    const flags = new FeatureFlags();
    const rawName: string = 'NOPE_NOT_A_FLAG';

    expect(flags.get(rawName as FlagName)).toBe(false);
    expect(flags.get(rawName as FlagName)).toBe(false);
    expect(flags.get('ANOTHER_UNKNOWN' as FlagName)).toBe(false);

    expect(flags.unknownFlagWarnings()).toEqual(['NOPE_NOT_A_FLAG', 'ANOTHER_UNKNOWN']);
  });
});

describe('FeatureFlags — applyRemote validation', () => {
  it('rejects a missing key and keeps old values', () => {
    const flags = new FeatureFlags();
    const next = flagsRecord();
    delete next['ENABLE_DNR'];

    const result = flags.applyRemote({ schemaVersion: FLAG_SCHEMA_VERSION, flags: next });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing-keys');
    expect(flags.get('ENABLE_DNR')).toBe(true);
    expect(flags.snapshot().source).toBe('default');
  });

  it('rejects an extra key', () => {
    const flags = new FeatureFlags();
    const next = flagsRecord();
    next['EXTRA_FLAG'] = true;

    const result = flags.applyRemote({ schemaVersion: FLAG_SCHEMA_VERSION, flags: next });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('extra-keys');
  });

  it('rejects a wrong value type', () => {
    const flags = new FeatureFlags();
    const next: Record<string, unknown> = { ...flagsRecord() };
    next['ENABLE_JSON_PRUNER'] = 42;

    const result = flags.applyRemote({ schemaVersion: FLAG_SCHEMA_VERSION, flags: next });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('bad-type');
    expect(flags.get('ENABLE_JSON_PRUNER')).toBe(true);
  });

  it('rejects a wrong schema version', () => {
    const flags = new FeatureFlags();
    const result = flags.applyRemote({ schemaVersion: 999, flags: flagsRecord() });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('schemaVersion');
  });

  it('rejects a malformed shape', () => {
    const flags = new FeatureFlags();
    expect(flags.applyRemote(null).reason).toBe('shape');
    expect(flags.applyRemote('nope').reason).toBe('shape');
    expect(flags.applyRemote({ schemaVersion: FLAG_SCHEMA_VERSION, flags: 5 }).reason).toBe('shape');
  });
});

describe('FeatureFlags — applyRemote success and subscribers', () => {
  it('applies a valid snapshot, replaces values and marks source adapter', () => {
    const now = (): number => 1234;
    const flags = new FeatureFlags(DEFAULT_FLAGS, now);
    const result = flags.applyRemote({
      schemaVersion: FLAG_SCHEMA_VERSION,
      flags: flagsRecord({ ENABLE_DNR: false }),
    });

    expect(result.ok).toBe(true);
    expect(flags.get('ENABLE_DNR')).toBe(false);
    const snapshot = flags.snapshot();
    expect(snapshot.source).toBe('adapter');
    expect(snapshot.receivedAt).toBe(1234);
  });

  it('does not notify subscribers when nothing changes', () => {
    const flags = new FeatureFlags();
    const handler = vi.fn();
    flags.subscribe(handler);

    const result = flags.applyRemote({ schemaVersion: FLAG_SCHEMA_VERSION, flags: flagsRecord() });

    expect(result.ok).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('notifies subscribers with exactly the changed flags', () => {
    const flags = new FeatureFlags();
    const handler = vi.fn();
    flags.subscribe(handler);

    flags.applyRemote({
      schemaVersion: FLAG_SCHEMA_VERSION,
      flags: flagsRecord({ ENABLE_DNR: false, ENABLE_FETCH_HOOK: false }),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(['ENABLE_FETCH_HOOK', 'ENABLE_DNR']);
  });

  it('stops notifying after unsubscribe and clears subscribers on dispose', () => {
    const flags = new FeatureFlags();
    const handler = vi.fn();
    const unsubscribe = flags.subscribe(handler);

    unsubscribe();
    flags.applyRemote({
      schemaVersion: FLAG_SCHEMA_VERSION,
      flags: flagsRecord({ ENABLE_DNR: false }),
    });
    expect(handler).not.toHaveBeenCalled();

    const second = vi.fn();
    flags.subscribe(second);
    flags.dispose();
    flags.applyRemote({
      schemaVersion: FLAG_SCHEMA_VERSION,
      flags: flagsRecord({ ENABLE_XHR_HOOK: false }),
    });
    expect(second).not.toHaveBeenCalled();
  });
});
