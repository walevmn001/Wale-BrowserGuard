import { describe, expect, it } from 'vitest';

import {
  PlaybackWatchdog,
  type WatchdogElement,
  type WatchdogMedia,
} from '../../../src/youtube/core/playback-watchdog';

/** A media-element stand-in with a manual event dispatcher. */
class FakeElement implements WatchdogElement {
  currentTime = 0;
  duration = 100;
  paused = false;
  ended = false;
  readyState = 4;
  networkState = 1;
  error: unknown = null;
  private readonly listeners = new Map<string, Array<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type);
    if (list === undefined) {
      return;
    }
    const index = list.indexOf(listener);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }

  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener();
    }
  }

  listenerCount(type: string): number {
    return (this.listeners.get(type) ?? []).length;
  }
}

function media(overrides: Partial<WatchdogMedia> = {}): WatchdogMedia {
  return {
    currentTime: 0,
    duration: 100,
    paused: false,
    ended: false,
    readyState: 4,
    networkState: 1,
    error: null,
    ...overrides,
  };
}

describe('PlaybackWatchdog — stall detection', () => {
  it('does not report a stall while the user has paused', () => {
    const watchdog = new PlaybackWatchdog({ stallMs: 8000 });
    expect(watchdog.sample(media({ paused: true }), 0)).toBeNull();
    expect(watchdog.sample(media({ paused: true }), 8000)).toBeNull();
    expect(watchdog.stalledForMs()).toBe(0);
  });

  it('does not report a stall for a short buffering hiccup', () => {
    const watchdog = new PlaybackWatchdog({ stallMs: 8000 });
    expect(watchdog.sample(media({ currentTime: 10 }), 0)).toBeNull();
    expect(watchdog.sample(media({ currentTime: 10 }), 3000)).toBeNull();
  });

  it('reports one stall once the threshold is passed, then stays quiet', () => {
    const watchdog = new PlaybackWatchdog({ stallMs: 8000 });
    expect(watchdog.sample(media({ currentTime: 10 }), 0)).toBeNull();
    expect(watchdog.sample(media({ currentTime: 10 }), 4000)).toBeNull();

    const signal = watchdog.sample(media({ currentTime: 10 }), 8000);
    expect(signal).toEqual({ type: 'STALLED', stalledMs: 8000 });
    // Latched: a second observation of the same stall reports nothing new.
    expect(watchdog.sample(media({ currentTime: 10 }), 9000)).toBeNull();
  });

  it('treats a rising readyState as buffering progress, not a stall', () => {
    const watchdog = new PlaybackWatchdog({ stallMs: 8000 });
    expect(watchdog.sample(media({ currentTime: 10, readyState: 2 }), 0)).toBeNull();
    expect(watchdog.sample(media({ currentTime: 10, readyState: 3 }), 5000)).toBeNull();
    expect(watchdog.stalledForMs()).toBe(0);
  });

  it('resets the stall timer when an element event fires', () => {
    const watchdog = new PlaybackWatchdog({ stallMs: 8000 });
    const element = new FakeElement();
    watchdog.attach(element);

    expect(watchdog.sample(media({ currentTime: 10 }), 0)).toBeNull();
    expect(watchdog.sample(media({ currentTime: 10 }), 3000)).toBeNull();
    expect(watchdog.stalledForMs()).toBe(3000);

    element.emit('playing');
    expect(watchdog.stalledForMs()).toBe(0);
  });

  it('reports a media error only once until playback recovers', () => {
    const watchdog = new PlaybackWatchdog();
    expect(watchdog.sample(media({ error: { code: 2 } }), 0)).toEqual({ type: 'MEDIA_ERROR' });
    expect(watchdog.sample(media({ error: { code: 2 } }), 1000)).toBeNull();
    // The error clears → the latch resets for a later error.
    expect(watchdog.sample(media({ currentTime: 5 }), 2000)).toBeNull();
    expect(watchdog.sample(media({ error: { code: 2 } }), 3000)).toEqual({ type: 'MEDIA_ERROR' });
  });

  it('returns no signal when the media is missing', () => {
    const watchdog = new PlaybackWatchdog();
    expect(watchdog.sample(undefined, 0)).toBeNull();
    expect(watchdog.stalledForMs()).toBe(0);
  });
});

describe('PlaybackWatchdog — listener bookkeeping', () => {
  it('attaches exactly one listener set per element', () => {
    const watchdog = new PlaybackWatchdog();
    const element = new FakeElement();

    watchdog.attach(element);
    watchdog.attach(element);

    expect(watchdog.isAttached(element)).toBe(true);
    expect(element.listenerCount('waiting')).toBe(1);
    expect(element.listenerCount('playing')).toBe(1);
  });

  it('removes its listeners on detach and allows a fresh attach', () => {
    const watchdog = new PlaybackWatchdog();
    const element = new FakeElement();

    const detach = watchdog.attach(element);
    detach();

    expect(watchdog.isAttached(element)).toBe(false);
    expect(element.listenerCount('waiting')).toBe(0);

    watchdog.attach(element);
    expect(element.listenerCount('waiting')).toBe(1);
  });
});
