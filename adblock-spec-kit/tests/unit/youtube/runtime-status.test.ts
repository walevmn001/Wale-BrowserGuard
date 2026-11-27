import { describe, expect, it } from 'vitest';

import {
  FLAG_NAMES,
  FLAG_SCHEMA_VERSION,
  type FlagName,
} from '../../../src/youtube/config/flags';
import type { ModuleStatus } from '../../../src/youtube/core/module';
import {
  HOOK_MODULE_BY_FLAG,
  YT_STATUS_MAX_AGE_MS,
  YT_STATUS_SCHEMA_VERSION,
  buildRuntimeStatus,
  isStatusFresh,
  isYtRuntimeStatus,
  statusHostOf,
  type YtRuntimeStatus,
} from '../../../src/youtube/state/runtime-status';

/** A full, all-true flag record so the test never depends on the A-3 defaults. */
function allFlags(value = true): Record<FlagName, boolean> {
  const flags = {} as Record<FlagName, boolean>;
  for (const name of FLAG_NAMES) {
    flags[name] = value;
  }
  return flags;
}

function moduleStatus(overrides: Partial<ModuleStatus> = {}): ModuleStatus {
  return { name: 'fetch-interceptor', enabled: true, installed: true, failures: 0, lastError: null, ...overrides };
}

function status(overrides: Partial<YtRuntimeStatus> = {}): YtRuntimeStatus {
  return {
    schemaVersion: YT_STATUS_SCHEMA_VERSION,
    at: 1000,
    url: 'https://www.youtube.com/watch?v=abc',
    flags: allFlags(),
    modules: { 'fetch-interceptor': { enabled: true, installed: true, failures: 0, lastError: null } },
    ...overrides,
  };
}

describe('buildRuntimeStatus', () => {
  it('copies every module fact and normalises the twelve flags to booleans', () => {
    const built = buildRuntimeStatus({
      now: 42,
      url: 'https://www.youtube.com/',
      flags: allFlags(),
      modules: [moduleStatus({ name: 'json-pruner', installed: false })],
    });
    expect(built.schemaVersion).toBe(YT_STATUS_SCHEMA_VERSION);
    expect(built.at).toBe(42);
    expect(built.url).toBe('https://www.youtube.com/');
    expect(built.modules['json-pruner']).toEqual({
      enabled: true,
      installed: false,
      failures: 0,
      lastError: null,
    });
    for (const name of FLAG_NAMES) {
      expect(built.flags[name]).toBe(true);
    }
  });

  it('never emits a non-boolean flag, even if the source lies', () => {
    const lying = { ...allFlags(), ENABLE_FETCH_HOOK: 1 } as unknown as Record<FlagName, boolean>;
    const built = buildRuntimeStatus({
      now: 1,
      url: 'https://www.youtube.com/',
      flags: lying,
      modules: [],
    });
    expect(built.flags.ENABLE_FETCH_HOOK).toBe(false);
  });
});

describe('isYtRuntimeStatus', () => {
  it('accepts a well-formed record', () => {
    expect(isYtRuntimeStatus(status())).toBe(true);
  });

  it('rejects a wrong schema version', () => {
    expect(isYtRuntimeStatus({ ...status(), schemaVersion: FLAG_SCHEMA_VERSION + 99 })).toBe(false);
  });

  it('rejects a non-object, a missing url and a non-finite time', () => {
    expect(isYtRuntimeStatus(null)).toBe(false);
    expect(isYtRuntimeStatus('nope')).toBe(false);
    expect(isYtRuntimeStatus({ ...status(), at: Number.NaN })).toBe(false);
    expect(isYtRuntimeStatus({ ...status(), url: 7 })).toBe(false);
  });

  it('rejects a record with a missing or non-boolean flag', () => {
    const missing = { ...allFlags() } as Record<string, unknown>;
    delete missing['ENABLE_XHR_HOOK'];
    expect(isYtRuntimeStatus({ ...status(), flags: missing })).toBe(false);

    const wrong = { ...allFlags(), ENABLE_XHR_HOOK: 'yes' };
    expect(isYtRuntimeStatus({ ...status(), flags: wrong })).toBe(false);
  });

  it('rejects a malformed module entry', () => {
    expect(
      isYtRuntimeStatus({
        ...status(),
        modules: { 'json-pruner': { enabled: true, installed: true, failures: 0 } },
      }),
    ).toBe(false);
  });

  it('accepts an empty modules map (engine registered, nothing yet confirmed)', () => {
    expect(isYtRuntimeStatus({ ...status(), modules: {} })).toBe(true);
  });
});

describe('isStatusFresh', () => {
  it('accepts a recent record and rejects one past the max age', () => {
    expect(isStatusFresh(status({ at: 1000 }), 1000)).toBe(true);
    expect(isStatusFresh(status({ at: 1000 }), 1000 + YT_STATUS_MAX_AGE_MS)).toBe(true);
    expect(isStatusFresh(status({ at: 1000 }), 1000 + YT_STATUS_MAX_AGE_MS + 1)).toBe(false);
  });

  it('tolerates a small clock skew into the future', () => {
    expect(isStatusFresh(status({ at: 1000 }), 500)).toBe(true);
    expect(isStatusFresh(status({ at: 1000 }), -70_000)).toBe(false);
  });
});

describe('statusHostOf', () => {
  it('returns the lower-cased host of a valid URL', () => {
    expect(statusHostOf('https://WWW.YouTube.com/watch?v=x')).toBe('www.youtube.com');
  });

  it('returns undefined for an unparsable URL', () => {
    expect(statusHostOf('not a url')).toBeUndefined();
  });
});

describe('HOOK_MODULE_BY_FLAG', () => {
  it('maps the three MAIN hook flags to their module names', () => {
    expect(HOOK_MODULE_BY_FLAG.ENABLE_JSON_PRUNER).toBe('json-pruner');
    expect(HOOK_MODULE_BY_FLAG.ENABLE_FETCH_HOOK).toBe('fetch-interceptor');
    expect(HOOK_MODULE_BY_FLAG.ENABLE_XHR_HOOK).toBe('xhr-interceptor');
  });
});
