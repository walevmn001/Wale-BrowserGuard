import { describe, expect, it } from 'vitest';

import {
  displayMessage,
  resolveDisplay,
  type DisplayState,
  type ToggleInputs,
} from '../../../src/youtube/state/toggle-state';

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

describe('displayMessage', () => {
  const cases: ReadonlyArray<readonly [DisplayState, string]> = [
    ['ENABLED', 'Đã bật chặn quảng cáo'],
    ['DISABLED', 'Đã tắt chặn quảng cáo'],
    ['WAITING_FOR_ADAPTER', 'Đang chờ trình chặn quảng cáo sẵn sàng…'],
    ['RECONCILING', 'Đang đồng bộ lại trạng thái chặn quảng cáo…'],
    ['UNKNOWN', 'Chưa xác định được trạng thái chặn quảng cáo'],
    ['ERROR', 'Không thể xác định trạng thái chặn quảng cáo'],
  ];

  it('maps every display state to its mandatory Vietnamese message', () => {
    for (const [state, message] of cases) {
      expect(displayMessage(state)).toBe(message);
    }
  });

  it('specialises the ERROR message for a mismatch', () => {
    expect(displayMessage('ERROR', 'mismatch')).toBe(
      'Không thể áp dụng lựa chọn: trạng thái hiện tại không khớp với mong muốn',
    );
  });
});
