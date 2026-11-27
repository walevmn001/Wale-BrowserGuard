import { describe, expect, it } from 'vitest';

import { DEFAULT_FLAGS, type FlagName } from '../../../src/youtube/config/flags';
import { displayMessage } from '../../../src/youtube/state/messages';
import {
  YT_STATUS_SCHEMA_VERSION,
  type YtModuleRuntime,
  type YtRuntimeStatus,
} from '../../../src/youtube/state/runtime-status';
import { buildYtLayers, mainGroupState, type YtEngineRuntime, type YtLayerRow } from '../../../src/popup/yt-layers';

/** A desired-flags record (all ON unless overridden). */
function desired(overrides: Partial<Record<FlagName, boolean>> = {}): Record<FlagName, boolean> {
  return { ...DEFAULT_FLAGS, ...overrides };
}

/** The three MAIN hook facts as the page would report them (all installed). */
function hookFacts(overrides: Partial<Record<string, YtModuleRuntime>> = {}): Record<string, YtModuleRuntime> {
  const installed: YtModuleRuntime = { enabled: true, installed: true, failures: 0, lastError: null };
  return {
    'json-pruner': installed,
    'fetch-interceptor': installed,
    'xhr-interceptor': installed,
    ...overrides,
  };
}

function runtimeStatus(
  modules: Record<string, YtModuleRuntime>,
  flagOverrides: Partial<Record<FlagName, boolean>> = {},
): YtRuntimeStatus {
  return {
    schemaVersion: YT_STATUS_SCHEMA_VERSION,
    at: 1_000,
    url: 'https://www.youtube.com/watch?v=abc',
    flags: { ...DEFAULT_FLAGS, ...flagOverrides },
    modules,
  };
}

function engine(overrides: Partial<YtEngineRuntime> = {}): YtEngineRuntime {
  return { moduleEnabled: true, registered: true, status: null, ...overrides };
}

function mainRows(rows: readonly YtLayerRow[]): readonly YtLayerRow[] {
  return rows.filter((row) => row.world === 'MAIN');
}

function isolatedRows(rows: readonly YtLayerRow[]): readonly YtLayerRow[] {
  return rows.filter((row) => row.world === 'ISOLATED');
}

describe('buildYtLayers — shape', () => {
  it('builds six rows, MAIN first then ISOLATED', () => {
    const rows = buildYtLayers(desired(), 'READY', 'AVAILABLE', engine({ status: runtimeStatus(hookFacts()) }));
    expect(rows).toHaveLength(6);
    expect(rows.slice(0, 3).every((row) => row.world === 'MAIN')).toBe(true);
    expect(rows.slice(3).every((row) => row.world === 'ISOLATED')).toBe(true);
  });

  it('desired mirrors the switch position for every row', () => {
    const rows = buildYtLayers(
      desired({ ENABLE_DNR: false, ENABLE_XHR_HOOK: false }),
      'READY',
      'AVAILABLE',
      engine({ status: runtimeStatus(hookFacts()) }),
    );
    expect(rows.find((row) => row.flag === 'ENABLE_DNR')?.desired).toBe(false);
    expect(rows.find((row) => row.flag === 'ENABLE_XHR_HOOK')?.desired).toBe(false);
    expect(rows.find((row) => row.flag === 'ENABLE_FETCH_HOOK')?.desired).toBe(true);
  });
});

describe('buildYtLayers — MAIN rows follow the runtime handshake', () => {
  it('shows DISABLED for every MAIN row when the module switch is off', () => {
    const rows = buildYtLayers(
      desired({ ENABLE_JSON_PRUNER: false }),
      'WAITING',
      'MISSING',
      engine({ moduleEnabled: false, registered: false }),
    );
    for (const row of mainRows(rows)) expect(row.state).toBe('DISABLED');
  });

  it('shows WAITING_FOR_REGISTRATION while the module is on but not registered', () => {
    const rows = buildYtLayers(
      desired({ ENABLE_JSON_PRUNER: false }),
      'WAITING',
      'MISSING',
      engine({ registered: false }),
    );
    for (const row of mainRows(rows)) expect(row.state).toBe('WAITING_FOR_REGISTRATION');
    const pruner = rows.find((row) => row.flag === 'ENABLE_JSON_PRUNER');
    expect(pruner?.savedNotApplied).toBe(true);
  });

  it('shows INITIALIZING while registered but no runtime status has landed', () => {
    const rows = buildYtLayers(desired(), 'READY', 'MISSING', engine({ status: null }));
    for (const row of mainRows(rows)) expect(row.state).toBe('INITIALIZING');
  });

  it('shows ERROR on an ERROR adapter', () => {
    const rows = buildYtLayers(desired(), 'ERROR', 'MISSING', engine());
    for (const row of mainRows(rows)) expect(row.state).toBe('ERROR');
  });

  it('shows ENABLED only when the page confirmed the hook installed', () => {
    const rows = buildYtLayers(desired(), 'READY', 'AVAILABLE', engine({ status: runtimeStatus(hookFacts()) }));
    for (const row of mainRows(rows)) expect(row.state).toBe('ENABLED');
  });

  it('shows DISABLED for a flag the engine agrees is off', () => {
    const rows = buildYtLayers(
      desired({ ENABLE_JSON_PRUNER: false }),
      'READY',
      'AVAILABLE',
      engine({
        status: runtimeStatus(
          hookFacts({ 'json-pruner': { enabled: false, installed: false, failures: 0, lastError: null } }),
          { ENABLE_JSON_PRUNER: false },
        ),
      }),
    );
    const pruner = rows.find((row) => row.flag === 'ENABLE_JSON_PRUNER');
    expect(pruner?.state).toBe('DISABLED');
    expect(pruner?.savedNotApplied).toBe(false);
  });

  it('shows ERROR when a flag is on but the hook is not actually installed', () => {
    const rows = buildYtLayers(
      desired(),
      'READY',
      'AVAILABLE',
      engine({
        status: runtimeStatus(hookFacts({ 'fetch-interceptor': { enabled: true, installed: false, failures: 0, lastError: null } })),
      }),
    );
    expect(rows.find((row) => row.flag === 'ENABLE_FETCH_HOOK')?.state).toBe('ERROR');
  });

  it('shows ERROR when a module recorded a last error', () => {
    const rows = buildYtLayers(
      desired(),
      'READY',
      'AVAILABLE',
      engine({
        status: runtimeStatus(hookFacts({ 'xhr-interceptor': { enabled: true, installed: true, failures: 1, lastError: 'boom' } })),
      }),
    );
    const xhr = rows.find((row) => row.flag === 'ENABLE_XHR_HOOK');
    expect(xhr?.state).toBe('ERROR');
    expect(xhr?.message).toContain('boom');
  });

  it('shows RECONCILING on a STALE snapshot', () => {
    const rows = buildYtLayers(desired(), 'READY', 'STALE', engine({ status: runtimeStatus(hookFacts()) }));
    for (const row of mainRows(rows)) expect(row.state).toBe('RECONCILING');
  });

  it('shows WAITING_FOR_ADAPTER on a MISSING snapshot', () => {
    const rows = buildYtLayers(desired(), 'WAITING', 'MISSING', engine({ status: runtimeStatus(hookFacts()) }));
    for (const row of mainRows(rows)) expect(row.state).toBe('WAITING_FOR_ADAPTER');
  });
});

describe('buildYtLayers — ISOLATED rows reflect the stored choice', () => {
  it('is ENABLED/DISABLED straight from desired, independent of the handshake', () => {
    const rows = buildYtLayers(
      desired({ ENABLE_DNR: false }),
      'WAITING',
      'MISSING',
      engine({ moduleEnabled: false, registered: false }),
    );
    const dnr = rows.find((row) => row.flag === 'ENABLE_DNR');
    expect(dnr?.state).toBe('DISABLED');
    expect(dnr?.savedNotApplied).toBe(false);
    for (const row of isolatedRows(rows)) {
      expect(['ENABLED', 'DISABLED']).toContain(row.state);
    }
  });

  it('every row carries a non-empty message', () => {
    const rows = buildYtLayers(desired(), 'WAITING', 'MISSING', engine({ registered: false }));
    for (const row of rows) expect(row.message.length).toBeGreaterThan(0);
  });
});

describe('mainGroupState', () => {
  it('picks the most notable MAIN state', () => {
    const rows = buildYtLayers(desired(), 'WAITING', 'MISSING', engine({ registered: false }));
    const group = mainGroupState(rows);
    expect(group.state).toBe('WAITING_FOR_REGISTRATION');
    expect(group.message).toBe(displayMessage('WAITING_FOR_REGISTRATION'));
  });

  it('falls back to UNKNOWN with no MAIN rows', () => {
    const group = mainGroupState([]);
    expect(group.state).toBe('UNKNOWN');
  });

  it('reports ERROR when a hook could not be installed', () => {
    const rows = buildYtLayers(
      desired(),
      'READY',
      'AVAILABLE',
      engine({ status: runtimeStatus(hookFacts({ 'json-pruner': { enabled: true, installed: false, failures: 0, lastError: null } })) }),
    );
    expect(mainGroupState(rows).state).toBe('ERROR');
  });

  it('reports ENABLED when every MAIN hook is confirmed', () => {
    const rows = buildYtLayers(desired(), 'READY', 'AVAILABLE', engine({ status: runtimeStatus(hookFacts()) }));
    expect(mainGroupState(rows).state).toBe('ENABLED');
  });
});
