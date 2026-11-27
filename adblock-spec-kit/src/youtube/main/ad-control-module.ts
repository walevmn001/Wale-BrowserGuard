/**
 * Ad-control module for the rebuilt YouTube engine (Phase 1–3 integration).
 *
 * This is the runtime counterpart of the old `content/youtube/ad-skip.ts`: it
 * watches the player (throttled) for the "ad playing" state and, when one
 * appears, first clicks a skip button; if there is none it mutes the video,
 * speeds it up and jumps to the end of the ad, then restores the user's
 * mute/rate/position once the ad ends.
 *
 * The decision logic lives in `core/` (pure, tested) and this file only reads the
 * player/video and performs the narrowly-scoped writes: it delegates the
 * what-to-do to `performAdAction` and the mute bookkeeping to
 * `AudioStateManager`, so the user's own audio state is always preserved and
 * only ours is undone.
 *
 * Bounds (same as the old module): at most `skipMaxAttempts` tries per ad (never
 * a loop that fights the page forever), a `adDetectThrottleMs` throttle, and the
 * seek only runs when the ad's duration is finite. Everything is fail-open — a
 * YouTube change must never break playback (Constitution — playback first).
 *
 * Gated by `ENABLE_AD_STATE_MACHINE` (the flag for the ad-lifecycle layer).
 */

import type { FeatureFlags } from '../config/flags';
import { TUNING } from '../config/tuning';
import { performAdAction, type ActionTarget } from '../core/ad-action-controller';
import { AudioStateManager } from '../core/audio-state-manager';
import type { DebugLogger } from '../core/debug-logger';
import type { ModuleStatus, YouTubeModule } from '../core/module';
import { skipButtonSelectors, type SelectorRegistry } from '../registry/selectors';
import { playerHasAdClass, readPlayer, readVideo } from './runtime-modules';

function statusOf(name: string, enabled: boolean): ModuleStatus {
  // These lifecycle modules have no distinct install step: active === installed.
  return { name, enabled, installed: enabled, failures: 0, lastError: null };
}

export function createAdControlModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  selectors: SelectorRegistry,
): YouTubeModule {
  const name = 'ad-control';
  let enabled = false;
  let observer: MutationObserver | undefined;
  let waiter: MutationObserver | undefined;
  let timer: number | undefined;
  let adActive = false;
  let attempts = 0;
  let saved: { readonly rate: number; readonly time: number } | undefined;
  const audio = new AudioStateManager();
  const skipSelectors = skipButtonSelectors();

  /** Only a *rendered* skip button is clicked; a hidden one is treated as absent. */
  function clickSkip(): boolean {
    for (const selector of skipSelectors) {
      try {
        const button = win.document.querySelector<HTMLElement>(selector);
        if (button !== null && button.getClientRects().length > 0) {
          button.click();
          return true;
        }
      } catch {
        // fail-open: a bad selector must not stop the others.
      }
    }
    return false;
  }

  /** Adapts the video element to what the pure action controller expects. */
  function makeTarget(video: HTMLVideoElement): ActionTarget {
    return {
      media: {
        muted: video.muted,
        playbackRate: video.playbackRate,
        currentTime: video.currentTime,
        duration: video.duration,
      },
      clickSkip,
      mute: () => {
        audio.forceMute(video);
      },
      setRate: (rate) => {
        if (video.playbackRate !== rate) {
          video.playbackRate = rate;
        }
      },
      seek: (time) => {
        video.currentTime = time;
      },
    };
  }

  /** Starts tracking an ad: fresh budget, remember what to restore later. */
  function startAd(video: HTMLVideoElement): void {
    adActive = true;
    attempts = 0;
    saved = { rate: video.playbackRate, time: video.currentTime };
    audio.adopt({ volume: video.volume, muted: video.muted });
  }

  function act(video: HTMLVideoElement): void {
    const outcome = performAdAction(makeTarget(video), {
      attempts,
      maxAttempts: TUNING.skipMaxAttempts,
      skipRate: TUNING.skipRate,
      epsilon: TUNING.skipEpsilon,
      canAct: true,
    });
    if (outcome.acted) {
      attempts += 1;
      logger.debug(name, 'ad action', { action: outcome.action });
    }
  }

  /** Undo the mute / rate / position we forced, as the ad ends. */
  function endAd(video: HTMLVideoElement): void {
    adActive = false;
    try {
      audio.restore(video);
    } catch {
      // fail-open
    }
    if (saved === undefined) {
      return;
    }
    try {
      video.playbackRate = saved.rate;
      if (Number.isFinite(saved.time)) {
        video.currentTime = saved.time;
      }
    } catch {
      // fail-open
    }
    saved = undefined;
  }

  function evaluate(): void {
    timer = undefined;
    try {
      if (!flags.get('ENABLE_AD_STATE_MACHINE')) {
        return;
      }
      const video = readVideo(win.document, selectors);
      if (video === undefined) {
        return;
      }
      if (playerHasAdClass(readPlayer(win.document, selectors), selectors)) {
        if (!adActive) {
          startAd(video);
        }
        act(video);
      } else if (adActive) {
        endAd(video);
      }
    } catch {
      // fail-open: a page change must never break playback.
    }
  }

  function schedule(): void {
    if (timer === undefined) {
      timer = win.setTimeout(evaluate, TUNING.adDetectThrottleMs);
    }
  }

  /** Attaches the mutation observer, waiting for the root if it is not there yet. */
  function attach(): void {
    try {
      const root = win.document.documentElement as HTMLElement | null;
      const Ctor = (win as unknown as { MutationObserver: new (cb: () => void) => MutationObserver })
        .MutationObserver;
      if (root === null) {
        const localWaiter = new Ctor(() => {
          if ((win.document.documentElement as HTMLElement | null) !== null) {
            localWaiter.disconnect();
            waiter = undefined;
            attach();
          }
        });
        waiter = localWaiter;
        localWaiter.observe(win.document, { childList: true });
        return;
      }
      const localObserver = new Ctor(schedule);
      observer = localObserver;
      localObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    } catch {
      // fail-open: without the observer the module simply does nothing.
    }
  }

  return {
    name,
    init(): void {
      enabled = flags.get('ENABLE_AD_STATE_MACHINE');
      if (!enabled) {
        return;
      }
      // Act once immediately (the ad may already be showing), then watch.
      schedule();
      attach();
    },
    dispose(): void {
      enabled = false;
      if (timer !== undefined) {
        win.clearTimeout(timer);
        timer = undefined;
      }
      try {
        observer?.disconnect();
        waiter?.disconnect();
      } catch {
        // fail-open
      }
      observer = undefined;
      waiter = undefined;
      adActive = false;
      attempts = 0;
      saved = undefined;
    },
    status(): ModuleStatus {
      return statusOf(name, enabled);
    },
  };
}
