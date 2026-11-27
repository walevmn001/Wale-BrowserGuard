import { describe, expect, it } from 'vitest';

import {
  buildEngineStatus,
  ENGINE_STATUS_ATTRIBUTE,
  ENGINE_STATUS_SCHEMA_VERSION,
  MAIN_HOOK_FLAGS,
  parseEngineStatus,
  resolveComponentState,
  type ComponentStateInput,
  type EngineComponentStatus,
  type EngineRuntimeStatus,
} from '../../../src/youtube/state/engine-status';

/** A hook record with both booleans defaulted to `value`. */
function hook(ready: boolean, enabled: boolean): EngineComponentStatus {
  return { ready, enabled };
}

/** A full status object with every hook set to the same `ready`/`enabled`. */
function statusWith(
  adapter: EngineRuntimeStatus['adapter'],
  ready: boolean,
  enabled: boolean,
  delivered = 1,
): EngineRuntimeStatus {
  return buildEngineStatus({
    adapter,
    delivered,
    hooks: {
      ENABLE_JSON_PRUNER: hook(ready, enabled),
      ENABLE_FETCH_HOOK: hook(ready, enabled),
      ENABLE_XHR_HOOK: hook(ready, enabled),
    },
  });
}

function input(overrides: Partial<ComponentStateInput> = {}): ComponentStateInput {
  return {
    moduleEnabled: true,
    registered: true,
    status: statusWith('READY', true, true),
    flag: 'ENABLE_FETCH_HOOK',
    desiredOn: true,
    ...overrides,
  };
}

describe('buildEngineStatus', () => {
  it('stamps the current schema version and the three hook flags', () => {
    const status = statusWith('READY', true, true);
    expect(status.schemaVersion).toBe(ENGINE_STATUS_SCHEMA_VERSION);
    expect(Object.keys(status.hooks)).toEqual([...MAIN_HOOK_FLAGS]);
  });

  it('coerces non-boolean hook fields to false so the wire shape is strict', () => {
    const status = buildEngineStatus({
      adapter: 'WAITING',
      delivered: 0,
      hooks: {
        ENABLE_JSON_PRUNER: { ready: 1, enabled: 'yes' } as unknown as EngineComponentStatus,
        ENABLE_FETCH_HOOK: hook(false, false),
        ENABLE_XHR_HOOK: hook(true, false),
      },
    });
    expect(status.hooks.ENABLE_JSON_PRUNER).toEqual({ ready: false, enabled: false });
    expect(status.hooks.ENABLE_XHR_HOOK).toEqual({ ready: true, enabled: false });
  });
});

describe('parseEngineStatus — strict wire parser', () => {
  it('round-trips a status the writer produced', () => {
    const status = statusWith('READY', true, true, 7);
    const parsed = parseEngineStatus(JSON.stringify(status));
    expect(parsed).toEqual(status);
  });

  it("reads the engine's own attribute name", () => {
    expect(ENGINE_STATUS_ATTRIBUTE).toBe('data-wg-yt-status');
  });

  it('rejects missing, empty and non-string input', () => {
    expect(parseEngineStatus(undefined)).toBeUndefined();
    expect(parseEngineStatus(null)).toBeUndefined();
    expect(parseEngineStatus('')).toBeUndefined();
  });

  it('rejects malformed JSON', () => {
    expect(parseEngineStatus('{ not json')).toBeUndefined();
  });

  it('rejects a wrong schema version', () => {
    const raw = JSON.stringify({ ...statusWith('READY', true, true), schemaVersion: 2 });
    expect(parseEngineStatus(raw)).toBeUndefined();
  });

  it('rejects an unknown adapter state', () => {
    const raw = JSON.stringify({ ...statusWith('READY', true, true), adapter: 'DONE' });
    expect(parseEngineStatus(raw)).toBeUndefined();
  });

  it('rejects a non-numeric or negative delivered count', () => {
    const base = statusWith('READY', true, true);
    expect(parseEngineStatus(JSON.stringify({ ...base, delivered: 'many' }))).toBeUndefined();
    expect(parseEngineStatus(JSON.stringify({ ...base, delivered: -1 }))).toBeUndefined();
    expect(parseEngineStatus(JSON.stringify({ ...base, delivered: NaN }))).toBeUndefined();
  });

  it('rejects a status missing any of the three hook records', () => {
    const base = statusWith('READY', true, true);
    const missing = { ...base, hooks: { ENABLE_JSON_PRUNER: hook(true, true) } };
    expect(parseEngineStatus(JSON.stringify(missing))).toBeUndefined();
  });

  it('rejects a hook whose fields are not both booleans', () => {
    const base = statusWith('READY', true, true);
    const bad = {
      ...base,
      hooks: { ...base.hooks, ENABLE_XHR_HOOK: { ready: true } },
    };
    expect(parseEngineStatus(JSON.stringify(bad))).toBeUndefined();
  });

  it('rejects arrays and non-objects', () => {
    expect(parseEngineStatus(JSON.stringify([]))).toBeUndefined();
    expect(parseEngineStatus(JSON.stringify(42))).toBeUndefined();
    expect(parseEngineStatus(JSON.stringify('READY'))).toBeUndefined();
  });
});

describe('resolveComponentState — fixed precedence', () => {
  it('reports DISABLED for every hook when the module switch is off', () => {
    for (const flag of MAIN_HOOK_FLAGS) {
      expect(resolveComponentState(input({ moduleEnabled: false, flag }))).toBe('DISABLED');
    }
  });

  it('reports WAITING_FOR_REGISTRATION before anything else', () => {
    expect(resolveComponentState(input({ registered: false }))).toBe('WAITING_FOR_REGISTRATION');
    // Even with no status at all, registration wins.
    expect(resolveComponentState(input({ registered: false, status: undefined }))).toBe(
      'WAITING_FOR_REGISTRATION',
    );
  });

  it('reports INITIALIZING while the MAIN engine is silent', () => {
    expect(resolveComponentState(input({ status: undefined }))).toBe('INITIALIZING');
  });

  it('reports ERROR when the adapter reported an error', () => {
    expect(resolveComponentState(input({ status: statusWith('ERROR', false, true) }))).toBe('ERROR');
  });

  it('reports WAITING_FOR_ADAPTER while the adapter has not delivered', () => {
    expect(resolveComponentState(input({ status: statusWith('WAITING', false, true, 0) }))).toBe(
      'WAITING_FOR_ADAPTER',
    );
  });

  it('reports INITIALIZING when the hook itself is not installed yet', () => {
    expect(resolveComponentState(input({ status: statusWith('READY', false, true) }))).toBe(
      'INITIALIZING',
    );
  });

  it('reports READY only when the applied flag matches the saved choice', () => {
    expect(resolveComponentState(input({ status: statusWith('READY', true, true), desiredOn: true }))).toBe(
      'READY',
    );
    // Applied OFF but the user wants ON: still settling, not READY.
    expect(resolveComponentState(input({ status: statusWith('READY', true, false), desiredOn: true }))).toBe(
      'INITIALIZING',
    );
    // Applied OFF and the user saved OFF: settled.
    expect(resolveComponentState(input({ status: statusWith('READY', true, false), desiredOn: false }))).toBe(
      'READY',
    );
  });

  it('never returns READY while the adapter is still WAITING', () => {
    expect(
      resolveComponentState(input({ status: statusWith('WAITING', true, true, 0), desiredOn: true })),
    ).toBe('WAITING_FOR_ADAPTER');
  });
});
