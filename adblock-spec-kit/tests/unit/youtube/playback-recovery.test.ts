import { describe, expect, it } from 'vitest';

import {
  PlaybackRecovery,
  type RecoveryInput,
  type RecoveryMedia,
} from '../../../src/youtube/core/playback-recovery';

function media(overrides: Partial<RecoveryMedia> = {}): RecoveryMedia {
  return {
    paused: false,
    ended: false,
    readyState: 4,
    networkState: 1,
    error: false,
    currentTime: 10,
    bufferedAhead: 5,
    ...overrides,
  };
}

function input(overrides: Partial<RecoveryInput> = {}): RecoveryInput {
  return { adActive: false, media: media(), stalledMs: 0, ...overrides };
}

describe('PlaybackRecovery — passive causes never seek', () => {
  it('never touches the media while an ad is active', () => {
    const recovery = new PlaybackRecovery();
    const decision = recovery.diagnose(input({ adActive: true }), 0);
    expect(decision).toMatchObject({ cause: 'AD_ACTIVE', level: 'NONE', passive: true });
  });

  it('treats a missing media element as unknown and passive', () => {
    const recovery = new PlaybackRecovery();
    const decision = recovery.diagnose(input({ media: undefined }), 0);
    expect(decision).toMatchObject({ cause: 'UNKNOWN', level: 'NONE', passive: true });
  });

  it('never recovers a paused or ended element', () => {
    const recovery = new PlaybackRecovery();
    expect(recovery.diagnose(input({ media: media({ paused: true }) }), 0)).toMatchObject({
      cause: 'PAUSED',
      level: 'NONE',
      passive: true,
    });
    expect(recovery.diagnose(input({ media: media({ ended: true }) }), 0)).toMatchObject({
      cause: 'ENDED',
      level: 'NONE',
      passive: true,
    });
  });

  it('waits out buffering and a missing buffer instead of reloading', () => {
    const recovery = new PlaybackRecovery();
    expect(
      recovery.diagnose(input({ media: media({ networkState: 2, readyState: 1 }) }), 0),
    ).toMatchObject({ cause: 'BUFFERING', level: 'WAIT', passive: true });
    expect(recovery.diagnose(input({ media: media({ bufferedAhead: 0 }) }), 0)).toMatchObject({
      cause: 'NO_BUFFER',
      level: 'WAIT',
      passive: true,
    });
  });
});

describe('PlaybackRecovery — media error budget', () => {
  it('escalates to DISABLED only once the attempt budget is spent', () => {
    const recovery = new PlaybackRecovery({ maxAttempts: 3 });
    const errorMedia = media({ error: true });
    expect(recovery.diagnose(input({ media: errorMedia }), 0).level).toBe('NONE');
    expect(recovery.diagnose(input({ media: errorMedia }), 1).level).toBe('NONE');
    expect(recovery.diagnose(input({ media: errorMedia }), 2).level).toBe('DISABLED');
    expect(recovery.isDisabled()).toBe(true);
  });
});

describe('PlaybackRecovery — suspect extension faults are never recovered', () => {
  it('recommends DISABLED for a suspected prune fault without touching the media', () => {
    const recovery = new PlaybackRecovery({ maxAttempts: 2 });
    const first = recovery.diagnose(
      input({ suspectPruneRemovedStreaming: true, media: undefined }),
      0,
    );
    expect(first).toMatchObject({ cause: 'SUSPECT_EXTENSION', level: 'NONE', passive: true });
    const second = recovery.diagnose(
      input({ suspectPruneRemovedStreaming: true, media: undefined }),
      1,
    );
    expect(second).toMatchObject({ cause: 'SUSPECT_EXTENSION', level: 'DISABLED', passive: true });
  });

  it('treats a suspected blocked video request the same way', () => {
    const recovery = new PlaybackRecovery();
    const decision = recovery.diagnose(input({ suspectBlockedVideoRequest: true }), 0);
    expect(decision).toMatchObject({ cause: 'SUSPECT_EXTENSION', passive: true });
  });
});

describe('PlaybackRecovery — escalating a genuine stall', () => {
  it('waits during the level-1 grace before any touch', () => {
    const recovery = new PlaybackRecovery({ l1Ms: 5000 });
    const decision = recovery.diagnose(input({ stalledMs: 4999 }), 0);
    expect(decision).toMatchObject({ cause: 'PLAYER_STUCK', level: 'WAIT', reason: 'l1-grace' });
    expect(recovery.attempts()).toBe(0);
  });

  it('resyncs once (level 2) then nudges once (level 3) under cooldown', () => {
    const recovery = new PlaybackRecovery({ l1Ms: 0, cooldownMs: 5000, maxAttempts: 3 });

    const resync = recovery.diagnose(input({ stalledMs: 9000 }), 1000);
    expect(resync).toMatchObject({ level: 'RESYNC', passive: false });
    expect(recovery.attempts()).toBe(1);

    const nudge = recovery.diagnose(input({ stalledMs: 9000 }), 2000);
    expect(nudge).toMatchObject({ level: 'NUDGE', passive: false });
    expect(recovery.attempts()).toBe(2);

    // A second nudge within the cooldown window is withheld.
    const cooled = recovery.diagnose(input({ stalledMs: 9000 }), 3000);
    expect(cooled).toMatchObject({ level: 'WAIT', reason: 'cooldown', passive: true });
    expect(recovery.attempts()).toBe(2);
  });

  it('does not repeat a nudge that already failed', () => {
    const recovery = new PlaybackRecovery({ l1Ms: 0, maxAttempts: 2 });
    recovery.diagnose(input({ stalledMs: 9000 }), 1000); // RESYNC (attempt 1)
    const decision = recovery.diagnose(input({ stalledMs: 9000, lastNudgeFailed: true }), 2000);
    expect(decision).toMatchObject({ level: 'DISABLED', passive: true });
  });

  it('disables itself once the attempt budget is exhausted', () => {
    const recovery = new PlaybackRecovery({ l1Ms: 0, maxAttempts: 1 });
    expect(recovery.diagnose(input({ stalledMs: 9000 }), 0)).toMatchObject({ level: 'RESYNC' });
    expect(recovery.diagnose(input({ stalledMs: 9000 }), 6000)).toMatchObject({ level: 'DISABLED' });
  });

  it('reset clears the per-video budget', () => {
    const recovery = new PlaybackRecovery({ l1Ms: 0, maxAttempts: 3 });
    recovery.diagnose(input({ stalledMs: 9000 }), 0);
    expect(recovery.attempts()).toBe(1);
    recovery.reset();
    expect(recovery.attempts()).toBe(0);
    expect(recovery.isDisabled()).toBe(false);
  });
});
