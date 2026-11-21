import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installYouTubeHealth, type HealthOptions } from '../../src/content/youtube/health';

/**
 * The Q5 monitor runs in the page, so this suite stubs `window`, `document`,
 * `chrome.runtime.sendMessage` and `setInterval` (fake timers) to drive the
 * media-error listener and the stall watchdog deterministically. Real wiring is
 * covered by `tests/e2e/youtube-health.spec.ts`.
 */

const OPTIONS: HealthOptions = { stallMs: 3_000, pollMs: 1_000 };

const globals = globalThis as unknown as Record<string, unknown>;

interface Fault {
  readonly type: string;
  readonly kind: string;
}

interface Harness {
  readonly video: { paused: boolean; ended: boolean; currentTime: number };
  readonly faults: Fault[];
  adShowing: boolean;
  errorHandler: ((event: unknown) => void) | undefined;
  querySelector: (selector: string) => unknown;
}

function setup(): Harness {
  const video = { paused: false, ended: false, currentTime: 0 };
  const faults: Fault[] = [];
  const harness: Harness = {
    video,
    faults,
    adShowing: false,
    errorHandler: undefined,
    querySelector: (selector) => {
      if (selector === 'video') {
        return video;
      }
      if (selector === '.ad-showing') {
        return harness.adShowing ? {} : null;
      }
      return null;
    },
  };
  globals['window'] = {};
  globals['document'] = {
    querySelector: (selector: string) => harness.querySelector(selector),
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      if (type === 'error') {
        harness.errorHandler = handler;
      }
    },
  };
  globals['chrome'] = {
    runtime: {
      lastError: undefined,
      sendMessage: (message: Fault) => {
        faults.push(message);
      },
    },
  };
  return harness;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  delete globals['window'];
  delete globals['document'];
  delete globals['chrome'];
});

describe('installYouTubeHealth', () => {
  it('installs only one watchdog even when injected twice', () => {
    setup();
    installYouTubeHealth(OPTIONS);

    installYouTubeHealth(OPTIONS);

    expect(vi.getTimerCount()).toBe(1);
  });

  it('reports a media error raised by the video element', () => {
    const harness = setup();
    installYouTubeHealth(OPTIONS);

    harness.errorHandler?.({ target: { tagName: 'VIDEO' } });

    expect(harness.faults).toEqual([{ type: 'wg:youtube-fault', kind: 'media-error' }]);
  });

  it('ignores errors from elements other than the video', () => {
    const harness = setup();
    installYouTubeHealth(OPTIONS);

    harness.errorHandler?.({ target: { tagName: 'IMG' } });
    harness.errorHandler?.({ target: null });

    expect(harness.faults).toEqual([]);
  });

  it('reports a stall once a playing video stops advancing for the threshold', () => {
    const harness = setup();
    installYouTubeHealth(OPTIONS);

    vi.advanceTimersByTime(OPTIONS.stallMs + OPTIONS.pollMs);

    expect(harness.faults).toEqual([{ type: 'wg:youtube-fault', kind: 'stall' }]);
  });

  it('does not report a stall while an ad is playing', () => {
    const harness = setup();
    harness.adShowing = true;
    installYouTubeHealth(OPTIONS);

    vi.advanceTimersByTime(OPTIONS.stallMs + OPTIONS.pollMs);

    expect(harness.faults).toEqual([]);
  });

  it('does not report a stall while the video is paused or ended', () => {
    const harness = setup();
    harness.video.paused = true;
    installYouTubeHealth(OPTIONS);
    vi.advanceTimersByTime(OPTIONS.stallMs + OPTIONS.pollMs);

    harness.video.paused = false;
    harness.video.ended = true;
    vi.advanceTimersByTime(OPTIONS.stallMs + OPTIONS.pollMs);

    expect(harness.faults).toEqual([]);
  });

  it('does not report while the video keeps advancing', () => {
    const harness = setup();
    installYouTubeHealth(OPTIONS);

    for (let tick = 0; tick < 10; tick += 1) {
      harness.video.currentTime += 1;
      vi.advanceTimersByTime(OPTIONS.pollMs);
    }

    expect(harness.faults).toEqual([]);
  });

  it('stays fail-open when the DOM query throws', () => {
    const harness = setup();
    installYouTubeHealth(OPTIONS);
    harness.querySelector = () => {
      throw new Error('detached');
    };

    expect(() => vi.advanceTimersByTime(OPTIONS.stallMs + OPTIONS.pollMs)).not.toThrow();
    expect(harness.faults).toEqual([]);
  });
});
