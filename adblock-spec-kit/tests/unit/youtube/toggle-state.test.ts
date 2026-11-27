import { describe, expect, it } from 'vitest';

import {
  isPendingState,
  resolveDisplay,
  resolveLayerDisplay,
  type DisplayState,
  type LayerDisplayInputs,
  type ToggleInputs,
} from '../../../src/youtube/state/toggle-state';
import type { YtModuleRuntime } from '../../../src/youtube/state/runtime-status';

/** Inputs that resolve to a nominal ENABLED state unless overridden. */
function inputs(overrides: Partial<ToggleInputs> = {}): ToggleInputs {
  return {
    desired: 'ON',
    effective: 'ENABLED',
    adapter: 'READY',
    snapshot: 'AVAILABLE',
    ...overrides,
  };
}

describe('resolveDisplay — priority table', () => {
  it('rule 1: an ERROR adapter wins over every other condition', () => {
    const resolution = resolveDisplay(
      inputs({ adapter: 'ERROR', snapshot: 'STALE', effective: 'UNKNOWN', desired: 'OFF' }),
    );
    expect(resolution.state).toBe('ERROR');
    expect(resolution.reason).toBe('adapter-error');
  });

  it('rule 2: a WAITING adapter yields WAITING_FOR_ADAPTER (reason adapter-waiting)', () => {
    const resolution = resolveDisplay(inputs({ adapter: 'WAITING' }));
    expect(resolution.state).toBe('WAITING_FOR_ADAPTER');
    expect(resolution.reason).toBe('adapter-waiting');
  });

  it('rule 2: a MISSING snapshot yields WAITING_FOR_ADAPTER (reason snapshot-missing)', () => {
    const resolution = resolveDisplay(inputs({ snapshot: 'MISSING' }));
    expect(resolution.state).toBe('WAITING_FOR_ADAPTER');
    expect(resolution.reason).toBe('snapshot-missing');
  });

  it('rule 2: an INVALID snapshot yields WAITING_FOR_ADAPTER (reason snapshot-invalid)', () => {
    const resolution = resolveDisplay(inputs({ snapshot: 'INVALID' }));
    expect(resolution.state).toBe('WAITING_FOR_ADAPTER');
    expect(resolution.reason).toBe('snapshot-invalid');
  });

  it('rule 3: a STALE snapshot yields RECONCILING (reason snapshot-stale)', () => {
    const resolution = resolveDisplay(inputs({ snapshot: 'STALE' }));
    expect(resolution.state).toBe('RECONCILING');
    expect(resolution.reason).toBe('snapshot-stale');
  });

  it('rule 4: an UNKNOWN effective state yields UNKNOWN (reason effective-unknown)', () => {
    const resolution = resolveDisplay(inputs({ effective: 'UNKNOWN' }));
    expect(resolution.state).toBe('UNKNOWN');
    expect(resolution.reason).toBe('effective-unknown');
  });

  it('rule 5: desired ON with effective ENABLED yields ENABLED', () => {
    const resolution = resolveDisplay(inputs({ desired: 'ON', effective: 'ENABLED' }));
    expect(resolution.state).toBe('ENABLED');
    expect(resolution.reason).toBeUndefined();
  });

  it('rule 6: desired OFF with effective DISABLED yields DISABLED', () => {
    const resolution = resolveDisplay(inputs({ desired: 'OFF', effective: 'DISABLED' }));
    expect(resolution.state).toBe('DISABLED');
    expect(resolution.reason).toBeUndefined();
  });

  it('rule 7: a mismatch (desired OFF but effective ENABLED) yields ERROR', () => {
    const resolution = resolveDisplay(inputs({ desired: 'OFF', effective: 'ENABLED' }));
    expect(resolution.state).toBe('ERROR');
    expect(resolution.reason).toBe('mismatch');
  });

  it('lets a transient condition win over a nominal state', () => {
    expect(resolveDisplay(inputs({ adapter: 'WAITING' })).state).toBe('WAITING_FOR_ADAPTER');
    expect(
      resolveDisplay(inputs({ desired: 'ON', effective: 'ENABLED', snapshot: 'STALE' })).state,
    ).toBe('RECONCILING');
  });
});

/** A confirmed runtime fact for one layer. */
function runtime(overrides: Partial<YtModuleRuntime> = {}): YtModuleRuntime {
  return { enabled: true, installed: true, failures: 0, lastError: null, ...overrides };
}

/** Layer inputs that resolve to a nominal ENABLED (READY) unless overridden. */
function layer(overrides: Partial<LayerDisplayInputs> = {}): LayerDisplayInputs {
  return {
    desired: 'ON',
    adapter: 'READY',
    snapshot: 'AVAILABLE',
    moduleEnabled: true,
    registered: true,
    runtime: runtime(),
    ...overrides,
  };
}

describe('resolveLayerDisplay — runtime handshake (Phase C)', () => {
  it('module switch off wins over everything → DISABLED', () => {
    const resolution = resolveLayerDisplay(
      layer({ moduleEnabled: false, adapter: 'ERROR', runtime: null }),
    );
    expect(resolution.state).toBe('DISABLED');
    expect(resolution.reason).toBe('module-off');
  });

  it('a module that is on but not registered → WAITING_FOR_REGISTRATION', () => {
    const resolution = resolveLayerDisplay(layer({ registered: false, runtime: null }));
    expect(resolution.state).toBe('WAITING_FOR_REGISTRATION');
    expect(resolution.reason).toBe('registration-missing');
  });

  it('a registered engine with no confirmed status → INITIALIZING (never READY)', () => {
    const resolution = resolveLayerDisplay(layer({ runtime: null }));
    expect(resolution.state).toBe('INITIALIZING');
    expect(resolution.reason).toBe('awaiting-status');
  });

  it('an ERROR adapter wins over a missing runtime → ERROR', () => {
    const resolution = resolveLayerDisplay(layer({ adapter: 'ERROR', runtime: null }));
    expect(resolution.state).toBe('ERROR');
    expect(resolution.reason).toBe('adapter-error');
  });

  it('adapter WAITING / missing or invalid snapshot → WAITING_FOR_ADAPTER', () => {
    expect(resolveLayerDisplay(layer({ adapter: 'WAITING' })).state).toBe('WAITING_FOR_ADAPTER');
    expect(resolveLayerDisplay(layer({ snapshot: 'MISSING' })).reason).toBe('snapshot-missing');
    expect(resolveLayerDisplay(layer({ snapshot: 'INVALID' })).reason).toBe('snapshot-invalid');
  });

  it('a STALE snapshot → RECONCILING', () => {
    const resolution = resolveLayerDisplay(layer({ snapshot: 'STALE' }));
    expect(resolution.state).toBe('RECONCILING');
    expect(resolution.reason).toBe('snapshot-stale');
  });

  it('confirmed enabled+installed with desired ON → ENABLED (READY)', () => {
    expect(resolveLayerDisplay(layer()).state).toBe('ENABLED');
  });

  it('a flag that is on but not installed is never READY → ERROR', () => {
    const resolution = resolveLayerDisplay(layer({ runtime: runtime({ installed: false }) }));
    expect(resolution.state).toBe('ERROR');
    expect(resolution.reason).toBe('not-installed');
  });

  it('a module failure or lastError → ERROR', () => {
    expect(resolveLayerDisplay(layer({ runtime: runtime({ failures: 2 }) })).state).toBe('ERROR');
    const errored = resolveLayerDisplay(
      layer({ runtime: runtime({ failures: 1, lastError: 'boom' }) }),
    );
    expect(errored.state).toBe('ERROR');
    expect(errored.reason).toBe('boom');
  });

  it('the engine agreeing the hook is off counts as DISABLED, disagreeing → ERROR', () => {
    expect(
      resolveLayerDisplay(layer({ desired: 'OFF', runtime: runtime({ enabled: false }) })).state,
    ).toBe('DISABLED');
    const mismatch = resolveLayerDisplay(layer({ desired: 'OFF', runtime: runtime({ enabled: true }) }));
    expect(mismatch.state).toBe('ERROR');
    expect(mismatch.reason).toBe('mismatch');
  });
});

describe('isPendingState', () => {
  it('flags every not-yet-applied transient state as pending', () => {
    const pending: readonly DisplayState[] = [
      'WAITING_FOR_REGISTRATION',
      'WAITING_FOR_ADAPTER',
      'INITIALIZING',
      'RECONCILING',
    ];
    for (const state of pending) {
      expect(isPendingState(state)).toBe(true);
    }
  });

  it('treats settled states as not pending', () => {
    const settled: readonly DisplayState[] = ['ENABLED', 'DISABLED', 'ERROR', 'UNKNOWN'];
    for (const state of settled) {
      expect(isPendingState(state)).toBe(false);
    }
  });
});
