import { describe, expect, it, vi } from 'vitest';

import {
  performAdAction,
  type ActionMedia,
  type ActionOptions,
} from '../../../src/youtube/core/ad-action-controller';

function options(overrides: Partial<ActionOptions> = {}): ActionOptions {
  return { attempts: 0, maxAttempts: 3, skipRate: 16, epsilon: 0.1, canAct: true, ...overrides };
}

function media(overrides: Partial<ActionMedia> = {}): ActionMedia {
  return { muted: false, playbackRate: 1, currentTime: 0, duration: 30, ...overrides };
}

/** A target whose media is `resolved` (undefined ⇒ no media element). */
function makeTarget(init: { skip?: boolean; media?: ActionMedia | undefined } = {}) {
  const clickSkip = vi.fn(() => init.skip ?? false);
  const mute = vi.fn();
  const setRate = vi.fn();
  const seek = vi.fn();
  const resolved: ActionMedia | undefined = 'media' in init ? init.media : media();
  const target = { media: resolved, clickSkip, mute, setRate, seek };
  return { target, clickSkip, mute, setRate, seek };
}

describe('performAdAction', () => {
  it('does nothing when acting is not allowed', () => {
    const spies = makeTarget();
    const outcome = performAdAction(spies.target, options({ canAct: false }));

    expect(outcome).toEqual({ acted: false, action: 'none', reason: 'cannot-act' });
    expect(spies.clickSkip).not.toHaveBeenCalled();
  });

  it('does nothing once the attempt budget is exhausted', () => {
    const spies = makeTarget();
    const outcome = performAdAction(spies.target, options({ attempts: 3, maxAttempts: 3 }));

    expect(outcome).toEqual({ acted: false, action: 'none', reason: 'max-attempts' });
  });

  it('prefers clicking the skip button', () => {
    const spies = makeTarget({ skip: true });
    const outcome = performAdAction(spies.target, options());

    expect(outcome).toEqual({ acted: true, action: 'skip', reason: 'skip-clicked' });
    expect(spies.mute).not.toHaveBeenCalled();
  });

  it('does nothing when there is no media and no skip', () => {
    const spies = makeTarget({ media: undefined });
    expect(performAdAction(spies.target, options()).reason).toBe('no-media');
  });

  it('refuses to seek when the duration is not finite', () => {
    const spies = makeTarget({ media: media({ duration: Number.POSITIVE_INFINITY }) });
    const outcome = performAdAction(spies.target, options());

    expect(outcome.reason).toBe('no-duration');
    expect(spies.seek).not.toHaveBeenCalled();
  });

  it('refuses to seek when the duration is zero or negative', () => {
    expect(performAdAction(makeTarget({ media: media({ duration: 0 }) }).target, options()).reason).toBe(
      'no-duration',
    );
    expect(
      performAdAction(makeTarget({ media: media({ duration: -5 }) }).target, options()).reason,
    ).toBe('no-duration');
  });

  it('fast-forwards a finite ad: mute, set the rate and seek to duration - epsilon', () => {
    const spies = makeTarget({ media: media({ duration: 30 }) });
    const outcome = performAdAction(spies.target, options({ epsilon: 0.5 }));

    expect(outcome).toEqual({ acted: true, action: 'fast-forward', reason: 'fast-forwarded' });
    expect(spies.mute).toHaveBeenCalledTimes(1);
    expect(spies.setRate).toHaveBeenCalledWith(16);
    expect(spies.seek).toHaveBeenCalledWith(29.5);
  });

  it('never seeks before the start of the media', () => {
    const spies = makeTarget({ media: media({ duration: 0.05 }) });
    performAdAction(spies.target, options({ epsilon: 1 }));

    expect(spies.seek).toHaveBeenCalledWith(0);
  });

  it('treats a throwing skip click as "no skip"', () => {
    const spies = makeTarget({ media: media() });
    spies.clickSkip.mockImplementation(() => {
      throw new Error('detached');
    });

    expect(performAdAction(spies.target, options()).action).toBe('fast-forward');
  });

  it('degrades to no action when the target throws (fail-open)', () => {
    const spies = makeTarget();
    spies.mute.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(performAdAction(spies.target, options())).toEqual({
      acted: false,
      action: 'none',
      reason: 'error',
    });
  });
});
