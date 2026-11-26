import { describe, expect, it } from 'vitest';

import { TUNING } from '../../../src/youtube/config/tuning';
import {
  initialAdState,
  isTerminal,
  reduce,
  type AdEvent,
  type AdMachineState,
} from '../../../src/youtube/core/ad-state-machine';

const NOW = 1000;

function state(state: AdMachineState['state'], attempts = 0): AdMachineState {
  return { state, attempts, updatedAt: 0 };
}

function detected(hasSkipButton: boolean): AdEvent {
  return { type: 'DETECTED', hasSkipButton };
}

describe('ad state machine — baseline', () => {
  it('starts IDLE with no attempts', () => {
    expect(initialAdState(NOW)).toEqual({ state: 'IDLE', attempts: 0, updatedAt: NOW });
  });

  it('treats only DISABLED as terminal', () => {
    expect(isTerminal('DISABLED')).toBe(true);
    expect(isTerminal('IDLE')).toBe(false);
    expect(isTerminal('RECOVERY')).toBe(false);
    expect(isTerminal('SKIP_PENDING')).toBe(false);
  });
});

describe('ad state machine — detection', () => {
  it('enters SKIP_PENDING when a skip button is rendered', () => {
    const next = reduce(initialAdState(NOW), detected(true), NOW);
    expect(next.state).toBe('SKIP_PENDING');
    expect(next.attempts).toBe(0);
  });

  it('enters AD_DETECTED without a skip button', () => {
    expect(reduce(initialAdState(NOW), detected(false), NOW).state).toBe('AD_DETECTED');
  });

  it('ignores an act event while still IDLE', () => {
    expect(reduce(state('IDLE'), { type: 'AD_STARTED' }, NOW).state).toBe('IDLE');
  });
});

describe('ad state machine — acting and attempt budget', () => {
  it('counts one attempt when an ad starts', () => {
    const next = reduce(state('AD_DETECTED', 0), { type: 'AD_STARTED' }, NOW);
    expect(next.state).toBe('AD_ACTIVE');
    expect(next.attempts).toBe(1);
  });

  it('refuses to act once the attempt budget is exhausted', () => {
    const next = reduce(
      state('AD_DETECTED', TUNING.skipMaxAttempts),
      { type: 'AD_STARTED' },
      NOW,
    );
    expect(next.state).toBe('AD_DETECTED');
    expect(next.attempts).toBe(TUNING.skipMaxAttempts);
  });

  it('counts a skip click and moves to SKIP_PENDING', () => {
    const next = reduce(state('AD_ACTIVE', 0), { type: 'SKIP_CLICKED' }, NOW);
    expect(next.state).toBe('SKIP_PENDING');
    expect(next.attempts).toBe(1);
  });

  it('moves to AD_ENDING without acting when the skip budget is exhausted', () => {
    const next = reduce(
      state('AD_ACTIVE', TUNING.skipMaxAttempts),
      { type: 'SKIP_CLICKED' },
      NOW,
    );
    expect(next.state).toBe('AD_ENDING');
    expect(next.attempts).toBe(TUNING.skipMaxAttempts);
  });
});

describe('ad state machine — ending and recovery', () => {
  it('returns to IDLE and resets attempts when an ad ends', () => {
    expect(reduce(state('AD_ENDING', 2), { type: 'AD_ENDED' }, NOW)).toEqual({
      state: 'IDLE',
      attempts: 0,
      updatedAt: NOW,
    });
  });

  it('enters RECOVERY from an active ad', () => {
    expect(reduce(state('AD_ACTIVE', 1), { type: 'RECOVERY_STARTED' }, NOW).state).toBe('RECOVERY');
  });

  it('returns to IDLE on RECOVERY_DONE', () => {
    expect(reduce(state('RECOVERY', 1), { type: 'RECOVERY_DONE' }, NOW)).toEqual({
      state: 'IDLE',
      attempts: 0,
      updatedAt: NOW,
    });
  });

  it('keeps an unknown event as a no-op in a non-disabled state', () => {
    const current = state('SKIP_PENDING', 1);
    expect(reduce(current, { type: 'RECOVERY_DONE' }, NOW)).toBe(current);
  });
});

describe('ad state machine — DISABLED invariants', () => {
  it('is absorbing: every event except ENABLE is ignored', () => {
    const disabled = state('DISABLED', 0);
    const events: AdEvent[] = [
      { type: 'AD_STARTED' },
      { type: 'SKIP_CLICKED' },
      { type: 'RECOVERY_STARTED' },
      detected(true),
      { type: 'AD_ENDED' },
    ];
    for (const event of events) {
      expect(reduce(disabled, event, NOW).state).toBe('DISABLED');
    }
  });

  it('can never enter RECOVERY while disabled', () => {
    expect(reduce(state('DISABLED', 0), { type: 'RECOVERY_STARTED' }, NOW).state).toBe('DISABLED');
  });

  it('leaves DISABLED for IDLE only on ENABLE', () => {
    expect(reduce(state('DISABLED', 3), { type: 'ENABLE' }, NOW)).toEqual({
      state: 'IDLE',
      attempts: 0,
      updatedAt: NOW,
    });
  });
});

describe('ad state machine — DISABLE / ENABLE', () => {
  it('DISABLE moves any state to DISABLED and resets attempts', () => {
    expect(reduce(state('AD_ACTIVE', 2), { type: 'DISABLE' }, NOW)).toEqual({
      state: 'DISABLED',
      attempts: 0,
      updatedAt: NOW,
    });
  });

  it('ENABLE is a no-op outside DISABLED', () => {
    const current = state('IDLE', 0);
    expect(reduce(current, { type: 'ENABLE' }, NOW)).toBe(current);
  });
});
