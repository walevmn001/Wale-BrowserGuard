import { describe, expect, it } from 'vitest';

import { DEFAULT_FLAGS, type FlagName } from '../../../src/youtube/config/flags';
import {
  MAIN_HOOK_FLAGS,
  buildEngineStatus,
  type EngineComponentStatus,
  type EngineRuntimeStatus,
  type MainHookFlagName,
} from '../../../src/youtube/state/engine-status';
import { displayMessage } from '../../../src/youtube/state/messages';
import { buildYtLayers, mainGroupState, type YtLayerInputs, type YtLayerRow } from '../../../src/popup/yt-layers';

/** A desired-flags record (all ON unless overridden). */
function desired(overrides: Partial<Record<FlagName, boolean>> = {}): Record<FlagName, boolean> {
  return { ...DEFAULT_FLAGS, ...overrides };
}

/** A settled MAIN status with every hook ready and matching the given value. */
function makeStatus(
  input: {
    adapter?: EngineRuntimeStatus['adapter'];
    delivered?: number;
    hooks?: Partial<Record<MainHookFlagName, EngineComponentStatus>>;
  } = {},
): EngineRuntimeStatus {
  const hooks = {} as Record<MainHookFlagName, EngineComponentStatus>;
  for (const flag of MAIN_HOOK_FLAGS) {
    hooks[flag] = input.hooks?.[flag] ?? { ready: true, enabled: true };
  }
  return buildEngineStatus({
    adapter: input.adapter ?? 'READY',
    delivered: input.delivered ?? 1,
    hooks,
  });
}

/** A full input set with a settled, matching engine unless overridden. */
function makeInput(overrides: Partial<YtLayerInputs> = {}): YtLayerInputs {
  return {
    desired: desired(),
    moduleEnabled: true,
    registered: true,
    status: makeStatus(),
    ...overrides,
  };
}

function mainRows(rows: readonly YtLayerRow[]): readonly YtLayerRow[] {
  return rows.filter((row) => row.world === 'MAIN');
}

function isolatedRows(rows: readonly YtLayerRow[]): readonly YtLayerRow[] {
  return rows.filter((row) => row.world === 'ISOLATED');
}

describe('buildYtLayers — shape', () => {
  it('builds six rows, MAIN first then ISOLATED', () => {
    const rows = buildYtLayers(makeInput());
    expect(rows).toHaveLength(6);
    expect(rows.slice(0, 3).every((row) => row.world === 'MAIN')).toBe(true);
    expect(rows.slice(3).every((row) => row.world === 'ISOLATED')).toBe(true);
  });

  it('desired mirrors the switch position for every row', () => {
    const rows = buildYtLayers(
      makeInput({ desired: desired({ ENABLE_DNR: false, ENABLE_XHR_HOOK: false }) }),
    );
    expect(rows.find((row) => row.flag === 'ENABLE_DNR')?.desired).toBe(false);
    expect(rows.find((row) => row.flag === 'ENABLE_XHR_HOOK')?.desired).toBe(false);
    expect(rows.find((row) => row.flag === 'ENABLE_FETCH_HOOK')?.desired).toBe(true);
  });
});

describe('buildYtLayers — MAIN rows follow the six-state runtime model', () => {
  it('is DISABLED for every MAIN row when the module is off', () => {
    const rows = buildYtLayers(makeInput({ moduleEnabled: false, registered: false, status: undefined }));
    for (const row of mainRows(rows)) {
      expect(row.state).toBe('DISABLED');
      expect(row.savedNotApplied).toBe(false);
    }
  });

  it('is WAITING_FOR_REGISTRATION when the module is on but the scripts are not registered', () => {
    const rows = buildYtLayers(makeInput({ registered: false, status: makeStatus() }));
    for (const row of mainRows(rows)) expect(row.state).toBe('WAITING_FOR_REGISTRATION');
  });

  it('is INITIALIZING when registered but the MAIN engine has not reported yet', () => {
    const rows = buildYtLayers(makeInput({ status: undefined }));
    for (const row of mainRows(rows)) expect(row.state).toBe('INITIALIZING');
  });

  it('is WAITING_FOR_ADAPTER while the adapter is WAITING', () => {
    const rows = buildYtLayers(makeInput({ status: makeStatus({ adapter: 'WAITING', delivered: 0 }) }));
    for (const row of mainRows(rows)) expect(row.state).toBe('WAITING_FOR_ADAPTER');
  });

  it('is ERROR when the adapter errors', () => {
    const rows = buildYtLayers(makeInput({ status: makeStatus({ adapter: 'ERROR' }) }));
    for (const row of mainRows(rows)) expect(row.state).toBe('ERROR');
  });

  it('is READY (ENABLED/DISABLED) once the hook is confirmed and matches the saved choice', () => {
    const on = buildYtLayers(makeInput());
    for (const row of mainRows(on)) expect(row.state).toBe('ENABLED');

    const off = buildYtLayers(
      makeInput({
        desired: desired({ ENABLE_JSON_PRUNER: false }),
        status: makeStatus({
          hooks: { ENABLE_JSON_PRUNER: { ready: true, enabled: false } },
        }),
      }),
    );
    const pruner = off.find((row) => row.flag === 'ENABLE_JSON_PRUNER');
    expect(pruner?.state).toBe('DISABLED');
    expect(pruner?.savedNotApplied).toBe(false);
  });

  it('is INITIALIZING while a hook has not confirmed (not ready)', () => {
    const rows = buildYtLayers(
      makeInput({
        status: makeStatus({ hooks: { ENABLE_FETCH_HOOK: { ready: false, enabled: false } } }),
      }),
    );
    expect(rows.find((row) => row.flag === 'ENABLE_FETCH_HOOK')?.state).toBe('INITIALIZING');
    expect(rows.find((row) => row.flag === 'ENABLE_XHR_HOOK')?.state).toBe('ENABLED');
  });

  it('is INITIALIZING when the applied flag does not yet match the saved choice', () => {
    // Desired OFF, but the page still applies ON (snapshot not applied yet).
    const rows = buildYtLayers(
      makeInput({
        desired: desired({ ENABLE_XHR_HOOK: false }),
        status: makeStatus({ hooks: { ENABLE_XHR_HOOK: { ready: true, enabled: true } } }),
      }),
    );
    const xhr = rows.find((row) => row.flag === 'ENABLE_XHR_HOOK');
    expect(xhr?.state).toBe('INITIALIZING');
    expect(xhr?.savedNotApplied).toBe(true);
  });

  it('flags savedNotApplied only for a transient, still-off layer', () => {
    const rows = buildYtLayers(
      makeInput({
        desired: desired({ ENABLE_JSON_PRUNER: false }),
        registered: false,
        status: undefined,
      }),
    );
    const pruner = rows.find((row) => row.flag === 'ENABLE_JSON_PRUNER');
    expect(pruner?.state).toBe('WAITING_FOR_REGISTRATION');
    expect(pruner?.savedNotApplied).toBe(true);
    // A layer saved ON is never flagged as "saved but not applied".
    const fetch = rows.find((row) => row.flag === 'ENABLE_FETCH_HOOK');
    expect(fetch?.savedNotApplied).toBe(false);
  });
});

describe('buildYtLayers — ISOLATED rows reflect the module and the stored choice', () => {
  it('is DISABLED for every ISOLATED row when the module is off', () => {
    const rows = buildYtLayers(makeInput({ moduleEnabled: false, registered: false, status: undefined }));
    for (const row of isolatedRows(rows)) expect(row.state).toBe('DISABLED');
  });

  it('is ENABLED/DISABLED straight from desired, independent of adapter health', () => {
    const rows = buildYtLayers(
      makeInput({ desired: desired({ ENABLE_DNR: false }), status: makeStatus({ adapter: 'WAITING' }) }),
    );
    expect(rows.find((row) => row.flag === 'ENABLE_DNR')?.state).toBe('DISABLED');
    expect(rows.find((row) => row.flag === 'ENABLE_DNR')?.savedNotApplied).toBe(false);
    for (const row of isolatedRows(rows)) {
      expect(['ENABLED', 'DISABLED']).toContain(row.state);
    }
  });

  it('every row carries a non-empty message', () => {
    const rows = buildYtLayers(makeInput({ registered: false, status: undefined }));
    for (const row of rows) expect(row.message.length).toBeGreaterThan(0);
  });
});

describe('mainGroupState', () => {
  it('reduces to the MAIN rows state and message', () => {
    const rows = buildYtLayers(makeInput({ registered: false, status: undefined }));
    const group = mainGroupState(rows);
    expect(group.state).toBe('WAITING_FOR_REGISTRATION');
    expect(group.message).toBe(displayMessage('WAITING_FOR_REGISTRATION'));
  });

  it('falls back to UNKNOWN with no MAIN rows', () => {
    const group = mainGroupState([]);
    expect(group.state).toBe('UNKNOWN');
  });

  it('reports ERROR when the adapter errors', () => {
    const rows = buildYtLayers(makeInput({ status: makeStatus({ adapter: 'ERROR' }) }));
    expect(mainGroupState(rows).state).toBe('ERROR');
  });

  it('reports the nominal state once every MAIN row is settled', () => {
    const rows = buildYtLayers(makeInput());
    expect(mainGroupState(rows).state).toBe('ENABLED');
  });
});
