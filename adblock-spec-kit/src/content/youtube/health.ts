/**
 * Q5 — watch the player for playback faults and report them (T066, algorithm.md
 * §Q5, US-15.4).
 *
 * Q1–Q4 try to remove ads, but a YouTube change can make them break playback
 * instead. This monitor is the safety net: it watches the `<video>` for a
 * *media error* and for a *stall* (a video that stops advancing while it is not
 * an ad), and reports each fault to the worker, which decides whether to degrade
 * the module (the decision itself lives in `background/youtube-health.ts`).
 *
 * Unlike the MAIN-world scripts, this runs in the **isolated** world: it only
 * reads the DOM (no page objects) and needs `chrome.runtime.sendMessage`, which
 * only the content-script world exposes. It is self-contained for the same
 * serialisation reason, and fully fail-open — a fault in the monitor must never
 * affect the page (Constitution VI, prompt 11 rule 1).
 */

/** Tuning passed to the page function; kept out of the function body. */
export interface HealthOptions {
  /** A non-ad video that stops advancing this long is treated as a stall. */
  readonly stallMs: number;
  /** How often the stall watchdog samples the player. */
  readonly pollMs: number;
}

export const YOUTUBE_HEALTH_OPTIONS: HealthOptions = {
  stallMs: 8_000,
  pollMs: 1_000,
};

export function installYouTubeHealth(options: HealthOptions): void {
  // NOTE: every value used below must be inline or a parameter — the function is
  // serialised with `Function.prototype.toString()`, so module-scope names would
  // be undefined in the page. `tests/unit/messages.test.ts` guards the message
  // literal against `MSG_YOUTUBE_FAULT`.
  const scope = window as unknown as Record<string, unknown>;
  if (scope['__adblockYtHealth'] === true) {
    return;
  }
  scope['__adblockYtHealth'] = true;

  const report = (kind: string): void => {
    try {
      // The callback form lets us swallow the "worker is starting" error that
      // would otherwise surface as an unhandled rejection.
      chrome.runtime.sendMessage({ type: 'wg:youtube-fault', kind }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // fail-open
    }
  };

  const adIsPlaying = (): boolean => document.querySelector('.ad-showing') !== null;

  // A media `error` does not bubble, so listen in the capture phase on document.
  try {
    document.addEventListener(
      'error',
      (event) => {
        const target = event.target;
        if (target !== null && (target as Element).tagName === 'VIDEO') {
          report('media-error');
        }
      },
      true,
    );
  } catch {
    // fail-open
  }

  let lastTime = -1;
  let stuckFor = 0;
  let reported = false;

  setInterval(() => {
    try {
      const element = document.querySelector('video');
      if (element === null) {
        return;
      }
      const video = element as HTMLVideoElement;
      // Ads are expected to pause the main video; a paused/ended video is not a
      // stall. Only a *playing, non-ad* video that stops advancing counts.
      if (adIsPlaying() || video.paused || video.ended) {
        stuckFor = 0;
        lastTime = video.currentTime;
        reported = false;
        return;
      }
      if (video.currentTime === lastTime) {
        stuckFor += options.pollMs;
        if (stuckFor >= options.stallMs && !reported) {
          reported = true;
          report('stall');
        }
      } else {
        stuckFor = 0;
        lastTime = video.currentTime;
        reported = false;
      }
    } catch {
      // fail-open
    }
  }, options.pollMs);
}
