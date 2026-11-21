import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installYouTubeAdSkip,
  YOUTUBE_AD_SKIP_OPTIONS,
} from '../../src/content/youtube/ad-skip';

/**
 * The ad-skip observer runs in the page, so it only touches `window`,
 * `document`, `MutationObserver`, `setTimeout` and the element API. This suite
 * stubs those (plus fake timers) to drive the throttle and the act/restore logic
 * deterministically without a browser. Real wiring is covered by
 * `tests/e2e/youtube-ad-skip.spec.ts`.
 */

const OPTIONS = YOUTUBE_AD_SKIP_OPTIONS;
const SKIP_SELECTORS = ['.ytp-ad-skip-button'];
const AD_SELECTOR = `.${OPTIONS.adClassName}`;

/** A `<video>` stand-in that counts every write, so caps are observable. */
class FakeVideo {
  duration = 15;
  mutedWrites = 0;
  rateWrites = 0;
  seekWrites = 0;
  private mutedValue: boolean;
  private rateValue: number;
  private timeValue: number;

  constructor(muted = false, rate = 1, time = 12) {
    this.mutedValue = muted;
    this.rateValue = rate;
    this.timeValue = time;
  }

  get muted(): boolean {
    return this.mutedValue;
  }
  set muted(value: boolean) {
    this.mutedValue = value;
    this.mutedWrites += 1;
  }
  get playbackRate(): number {
    return this.rateValue;
  }
  set playbackRate(value: number) {
    this.rateValue = value;
    this.rateWrites += 1;
  }
  get currentTime(): number {
    return this.timeValue;
  }
  set currentTime(value: number) {
    this.timeValue = value;
    this.seekWrites += 1;
  }
}

class FakeSkipButton {
  clicks = 0;
  visible = true;

  getClientRects(): { readonly length: number } {
    return { length: this.visible ? 1 : 0 };
  }

  click(): void {
    this.clicks += 1;
  }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];

  private readonly callback: (records: MutationRecord[], observer: MutationObserver) => void;

  constructor(callback: (records: MutationRecord[], observer: MutationObserver) => void) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe(): void {}
  disconnect(): void {}

  /** Pretend the page mutated; the throttle turns this into one pass. */
  fire(): void {
    this.callback([], this as unknown as MutationObserver);
  }
}

interface PageState {
  adPlaying: boolean;
  readonly video: FakeVideo;
  readonly skip: FakeSkipButton;
}

interface StateInit {
  adPlaying?: boolean;
  skipVisible?: boolean;
  video?: FakeVideo;
}

function makeState(init: StateInit = {}): PageState {
  const skip = new FakeSkipButton();
  if (init.skipVisible === false) {
    skip.visible = false;
  }
  return {
    adPlaying: init.adPlaying ?? false,
    video: init.video ?? new FakeVideo(),
    skip,
  };
}

function makeDocument(state: PageState): unknown {
  return {
    documentElement: {},
    querySelector(selector: string): unknown {
      if (selector === 'video') {
        return state.video;
      }
      if (selector === AD_SELECTOR) {
        return state.adPlaying ? {} : null;
      }
      if (SKIP_SELECTORS.includes(selector)) {
        return state.skip;
      }
      return null;
    },
  };
}

const globals = globalThis as unknown as Record<string, unknown>;

function latestObserver(): FakeMutationObserver {
  const observer = FakeMutationObserver.instances.at(-1);
  if (observer === undefined) {
    throw new Error('no observer was installed');
  }
  return observer;
}

/** Drives exactly one throttled observation pass. */
function pass(): void {
  latestObserver().fire();
  vi.advanceTimersByTime(OPTIONS.throttleMs);
}

function mount(state: PageState): void {
  globals['document'] = makeDocument(state);
  installYouTubeAdSkip(SKIP_SELECTORS, OPTIONS);
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeMutationObserver.instances = [];
  delete globals['__adblockYtAdSkip'];
  globals['window'] = globalThis;
  globals['MutationObserver'] = FakeMutationObserver;
});

afterEach(() => {
  vi.useRealTimers();
  delete globals['window'];
  delete globals['document'];
  delete globals['MutationObserver'];
  delete globals['__adblockYtAdSkip'];
});

describe('installYouTubeAdSkip', () => {
  it('installs only one observer even if called again', () => {
    const state = makeState();
    mount(state);
    installYouTubeAdSkip(SKIP_SELECTORS, OPTIONS);

    expect(FakeMutationObserver.instances).toHaveLength(1);
  });

  it('does nothing while no ad is playing', () => {
    const state = makeState();
    mount(state);

    pass();

    expect(state.video.mutedWrites).toBe(0);
    expect(state.video.seekWrites).toBe(0);
    expect(state.skip.clicks).toBe(0);
  });

  it('clicks the skip button when it is rendered', () => {
    const state = makeState({ adPlaying: true });
    mount(state);

    pass();

    expect(state.skip.clicks).toBe(1);
    // A click is the whole fallback — no mute or seek is needed.
    expect(state.video.mutedWrites).toBe(0);
    expect(state.video.seekWrites).toBe(0);
  });

  it('ignores a skip button that is not rendered', () => {
    const state = makeState({ adPlaying: true, skipVisible: false });
    mount(state);

    pass();

    expect(state.skip.clicks).toBe(0);
    expect(state.video.mutedWrites).toBe(1);
  });

  it('mutes, speeds up and seeks to the end when no skip button is shown', () => {
    const state = makeState({ adPlaying: true, skipVisible: false });
    mount(state);

    pass();

    expect(state.video.muted).toBe(true);
    expect(state.video.playbackRate).toBe(OPTIONS.skipRate);
    expect(state.video.currentTime).toBeCloseTo(state.video.duration - OPTIONS.epsilon);
  });

  it('does not seek when the ad duration is unknown', () => {
    const video = new FakeVideo();
    video.duration = Number.POSITIVE_INFINITY;
    const state = makeState({ adPlaying: true, skipVisible: false, video });
    mount(state);

    pass();

    expect(state.video.muted).toBe(true);
    expect(state.video.seekWrites).toBe(0);
  });

  it('restores the mute flag, rate and position once the ad ends', () => {
    const video = new FakeVideo(false, 1, 12);
    const state = makeState({ adPlaying: true, skipVisible: false, video });
    mount(state);

    pass();
    expect(state.video.muted).toBe(true);

    state.adPlaying = false;
    pass();

    expect(state.video.muted).toBe(false);
    expect(state.video.playbackRate).toBe(1);
    expect(state.video.currentTime).toBe(12);
  });

  it('stops after maxAttempts tries per ad (no infinite loop)', () => {
    const state = makeState({ adPlaying: true, skipVisible: false });
    mount(state);

    for (let index = 0; index < OPTIONS.maxAttempts + 3; index += 1) {
      pass();
    }

    expect(state.video.mutedWrites).toBe(OPTIONS.maxAttempts);
  });

  it('fails open when the page DOM throws', () => {
    globals['document'] = {
      documentElement: {},
      querySelector(): unknown {
        throw new Error('boom');
      },
    };
    installYouTubeAdSkip(SKIP_SELECTORS, OPTIONS);

    expect(() => pass()).not.toThrow();
  });
});
