import { describe, expect, it } from 'vitest';

import { DEFAULT_FLAGS, type FlagName } from '../../../src/youtube/config/flags';
import { displayMessage } from '../../../src/youtube/state/messages';
import { buildYtLayers, mainGroupState, type YtLayerRow } from '../../../src/popup/yt-layers';

/** A desired-flags record (all ON unless overridden). */
function desired(overrides: Partial<Record<FlagName, boolean>> = {}): Record<FlagName, boolean> {
  return { ...DEFAULT_FLAGS, ...overrides };
}

function mainRows(rows: readonly YtLayerRow[]): readonly YtLayerRow[] {
  return rows.filter((row) => row.world === 'MAIN');
}

function isolatedRows(rows: readonly YtLayerRow[]): readonly YtLayerRow[] {
  return rows.filter((row) => row.world === 'ISOLATED');
}

describe('buildYtLayers — shape', () => {
  it('builds six rows, MAIN first then ISOLATED', () => {
    const rows = buildYtLayers(desired(), 'READY', 'AVAILABLE');
    expect(rows).toHaveLength(6);
    expect(rows.slice(0, 3).every((row) => row.world === 'MAIN')).toBe(true);
    expect(rows.slice(3).every((row) => row.world === 'ISOLATED')).toBe(true);
  });

  it('desired mirrors the switch position for every row', () => {
    const rows = buildYtLayers(desired({ ENABLE_DNR: false, ENABLE_XHR_HOOK: false }), 'READY', 'AVAILABLE');
    expect(rows.find((row) => row.flag === 'ENABLE_DNR')?.desired).toBe(false);
    expect(rows.find((row) => row.flag === 'ENABLE_XHR_HOOK')?.desired).toBe(false);
    expect(rows.find((row) => row.flag === 'ENABLE_FETCH_HOOK')?.desired).toBe(true);
  });
});

describe('buildYtLayers — MAIN rows follow the priority table', () => {
  it('shows WAITING_FOR_ADAPTER while the adapter is WAITING, even when desired is OFF', () => {
    const rows = buildYtLayers(desired({ ENABLE_JSON_PRUNER: false }), 'WAITING', 'MISSING');
    for (const row of mainRows(rows)) {
      expect(row.state).toBe('WAITING_FOR_ADAPTER');
    }
    const pruner = rows.find((row) => row.flag === 'ENABLE_JSON_PRUNER');
    expect(pruner?.state).toBe('WAITING_FOR_ADAPTER');
    expect(pruner?.state).not.toBe('DISABLED');
    expect(pruner?.savedNotApplied).toBe(true);
  });

  it('shows WAITING_FOR_ADAPTER on a MISSING snapshot', () => {
    const rows = buildYtLayers(desired(), 'READY', 'MISSING');
    for (const row of mainRows(rows)) expect(row.state).toBe('WAITING_FOR_ADAPTER');
  });

  it('shows RECONCILING on a STALE snapshot', () => {
    const rows = buildYtLayers(desired(), 'READY', 'STALE');
    for (const row of mainRows(rows)) expect(row.state).toBe('RECONCILING');
  });

  it('shows ERROR on an ERROR adapter', () => {
    const rows = buildYtLayers(desired(), 'ERROR', 'STALE');
    for (const row of mainRows(rows)) expect(row.state).toBe('ERROR');
  });

  it('shows ENABLED/DISABLED once the adapter is READY with an AVAILABLE snapshot', () => {
    const on = buildYtLayers(desired(), 'READY', 'AVAILABLE');
    for (const row of mainRows(on)) expect(row.state).toBe('ENABLED');

    const off = buildYtLayers(desired({ ENABLE_JSON_PRUNER: false }), 'READY', 'AVAILABLE');
    const pruner = off.find((row) => row.flag === 'ENABLE_JSON_PRUNER');
    expect(pruner?.state).toBe('DISABLED');
    expect(pruner?.savedNotApplied).toBe(false);
  });
});

describe('buildYtLayers — ISOLATED rows reflect the stored choice', () => {
  it('is ENABLED/DISABLED straight from desired, independent of adapter health', () => {
    const rows = buildYtLayers(desired({ ENABLE_DNR: false }), 'WAITING', 'MISSING');
    const dnr = rows.find((row) => row.flag === 'ENABLE_DNR');
    expect(dnr?.state).toBe('DISABLED');
    expect(dnr?.savedNotApplied).toBe(false);
    for (const row of isolatedRows(rows)) {
      expect(['ENABLED', 'DISABLED']).toContain(row.state);
    }
  });

  it('every row carries a non-empty message', () => {
    const rows = buildYtLayers(desired(), 'WAITING', 'MISSING');
    for (const row of rows) expect(row.message.length).toBeGreaterThan(0);
  });
});

describe('mainGroupState', () => {
  it('reduces to the MAIN rows state and message', () => {
    const rows = buildYtLayers(desired(), 'WAITING', 'MISSING');
    const group = mainGroupState(rows);
    expect(group.state).toBe('WAITING_FOR_ADAPTER');
    expect(group.message).toBe(displayMessage('WAITING_FOR_ADAPTER'));
  });

  it('falls back to UNKNOWN with no MAIN rows', () => {
    const group = mainGroupState([]);
    expect(group.state).toBe('UNKNOWN');
  });

  it('reports ERROR when the adapter errors', () => {
    const rows = buildYtLayers(desired(), 'ERROR', 'MISSING');
    expect(mainGroupState(rows).state).toBe('ERROR');
  });
});
