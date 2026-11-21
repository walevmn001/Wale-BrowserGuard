/**
 * Q4 — skip or fast-forward a YouTube ad that still plays (T065, algorithm.md §Q4).
 *
 * Q1–Q3 try to avoid the ad entirely; Q4 is the fallback for an ad that plays
 * anyway. It watches the player (throttled) for the "ad playing" state and, when
 * one appears, first clicks a skip button (data: `skipSelectors`); if there is
 * none it mutes the video, speeds it up and jumps to the end of the ad, then
 * restores the user's mute/rate/position once the ad ends.
 *
 * Bounds (algorithm.md §Q4): at most `maxAttempts` tries per ad (never a loop
 * that fights the page forever), a 200 ms throttle, and the seek only runs when
 * the ad's duration is finite. The whole observer body is fail-open — a YouTube
 * change must never break playback (Constitution VI, prompt 11 rule 1).
 *
 * `installYouTubeAdSkip` runs in the page via `chrome.scripting.executeScript`,
 * which serialises the function with `Function.prototype.toString()`. It must
 * therefore be **self-contained**: only its parameters and page globals — no
 * imports and no closure over module scope.
 */

/** Tuning passed to the page function; kept out of the function body (see above). */
export interface AdSkipOptions {
  /** Minimum gap between observation passes (algorithm.md §Q4). */
  readonly throttleMs: number;
  /** Tries per ad before giving up (no infinite loop). */
  readonly maxAttempts: number;
  /** Playback rate to force while fast-forwarding an ad. */
  readonly skipRate: number;
  /** Seek to `duration - epsilon` so the ad finishes immediately. */
  readonly epsilon: number;
  /**
   * Class the player carries while an ad plays (`.ad-showing`).
   *
   * TODO(verify): confirm the current class against a real YouTube session
   * (DevTools → inspect `#movie_player` during an ad break) — T069.
   */
  readonly adClassName: string;
}

export const YOUTUBE_AD_SKIP_OPTIONS: AdSkipOptions = {
  throttleMs: 200,
  maxAttempts: 3,
  skipRate: 16,
  epsilon: 0.1,
  adClassName: 'ad-showing',
};

export function installYouTubeAdSkip(
  skipSelectors: readonly string[],
  options: AdSkipOptions,
): void {
  // NOTE: every value used below must be inline or a parameter — the function is
  // serialised with `Function.prototype.toString()`, so module-scope names would
  // be undefined in the page. `tests/unit/youtube-ad-skip.test.ts` guards this.
  const scope = window as unknown as Record<string, unknown>;
  if (scope['__adblockYtAdSkip'] === true) {
    return;
  }
  scope['__adblockYtAdSkip'] = true;

  let adPlaying = false;
  let attempts = 0;
  let saved: { muted: boolean; rate: number; time: number } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const video = (): HTMLVideoElement | undefined => {
    const element = document.querySelector('video');
    return element === null ? undefined : (element as HTMLVideoElement);
  };

  const adIsPlaying = (): boolean =>
    document.querySelector(`.${options.adClassName}`) !== null;

  /** Only a *rendered* skip button is clicked; a hidden one is treated as absent. */
  const clickSkip = (): boolean => {
    for (let index = 0; index < skipSelectors.length; index += 1) {
      const button = document.querySelector(skipSelectors[index] as string);
      if (button !== null && (button as HTMLElement).getClientRects().length > 0) {
        (button as HTMLElement).click();
        return true;
      }
    }
    return false;
  };

  const startAd = (element: HTMLVideoElement): void => {
    adPlaying = true;
    attempts = 0;
    saved = { muted: element.muted, rate: element.playbackRate, time: element.currentTime };
  };

  const act = (element: HTMLVideoElement): void => {
    if (attempts >= options.maxAttempts) {
      return;
    }
    attempts += 1;
    if (clickSkip()) {
      return;
    }
    element.muted = true;
    if (element.playbackRate !== options.skipRate) {
      element.playbackRate = options.skipRate;
    }
    const { duration } = element;
    if (Number.isFinite(duration) && duration > 0) {
      element.currentTime = Math.max(0, duration - options.epsilon);
    }
  };

  /** Undo the mute / rate / position we forced, as the ad ends (algorithm.md §Q4). */
  const endAd = (element: HTMLVideoElement): void => {
    adPlaying = false;
    if (saved === undefined) {
      return;
    }
    element.muted = saved.muted;
    element.playbackRate = saved.rate;
    if (Number.isFinite(saved.time)) {
      element.currentTime = saved.time;
    }
    saved = undefined;
  };

  const evaluate = (): void => {
    timer = undefined;
    try {
      const element = video();
      if (element === undefined) {
        return;
      }
      if (adIsPlaying()) {
        if (!adPlaying) {
          startAd(element);
        }
        act(element);
      } else if (adPlaying) {
        endAd(element);
      }
    } catch {
      // fail-open: a page change must never break playback.
    }
  };

  const schedule = (): void => {
    if (timer === undefined) {
      timer = setTimeout(evaluate, options.throttleMs);
    }
  };

  try {
    const observer = new MutationObserver(schedule);
    const root = document.documentElement;
    if (root !== null) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  } catch {
    // fail-open: if the observer cannot be installed, do nothing.
  }
}
