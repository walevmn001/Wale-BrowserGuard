/**
 * Ad and playback classifiers (Phase 1 — core).
 *
 * Pure and DOM-free, so the exact same decision runs in the page and in a test.
 *
 * `classifyAd` is a weighted multi-signal vote (spec S1–S5): a single weak
 * signal is never enough to declare an ad, and several agreeing signals reach
 * the threshold. `classifyPlayback` is the counterpart safety net — it maps the
 * raw media element counters to a playback state, so the engine can tell a
 * genuinely playing video apart from one that is merely buffering, paused or
 * errored, and never mistake those for an ad.
 */

export interface AdSignals {
  readonly playerHasAdClass: boolean;
  readonly adBreakPlaying: boolean;
  readonly playerResponseHasAdFields: boolean;
  readonly adDurationMismatch: boolean;
  readonly skipButtonVisible: boolean;
}

export type AdClassification = 'AD' | 'NOT_AD' | 'UNCERTAIN';

/**
 * Weight of each signal in the vote (spec S1–S5). A strong structural signal
 * (the player's ad class, an active ad break, a rendered skip button) weighs 2,
 * a weaker corroborating signal weighs 1.
 */
export const AD_SIGNAL_WEIGHTS: Readonly<Record<keyof AdSignals, number>> = {
  playerHasAdClass: 2,
  adBreakPlaying: 2,
  playerResponseHasAdFields: 1,
  adDurationMismatch: 1,
  skipButtonVisible: 2,
};

/** Default score at which the vote declares an ad. */
const DEFAULT_AD_THRESHOLD = 2;

/**
 * Weighted vote over `signals`. Returns `AD` at or above `threshold` (default
 * 2), `UNCERTAIN` at exactly 1, and `NOT_AD` otherwise — so the all-false
 * "empty" signal set is `NOT_AD`.
 */
export function classifyAd(signals: AdSignals, threshold = DEFAULT_AD_THRESHOLD): AdClassification {
  let score = 0;
  const keys = Object.keys(AD_SIGNAL_WEIGHTS) as Array<keyof AdSignals>;
  for (const key of keys) {
    if (signals[key]) {
      score += AD_SIGNAL_WEIGHTS[key];
    }
  }
  if (score >= threshold) {
    return 'AD';
  }
  if (score === 1) {
    return 'UNCERTAIN';
  }
  return 'NOT_AD';
}

export interface MediaState {
  readonly paused: boolean;
  readonly ended: boolean;
  readonly readyState: number;
  readonly networkState: number;
  readonly error: boolean;
}

export type PlaybackState =
  | 'BUFFERING'
  | 'LOADING'
  | 'PAUSED'
  | 'ENDED'
  | 'MEDIA_ERROR'
  | 'PLAYING';

/** HTMLMediaElement.networkState: fetching the media resource. */
const NETWORK_LOADING = 2;
/** HTMLMediaElement.readyState: metadata loaded but no current frame yet. */
const HAVE_METADATA = 1;
/** HTMLMediaElement.readyState: enough data to play through smoothly. */
const HAVE_ENOUGH_DATA = 4;

/**
 * Maps raw media counters to a playback state. The checks are ordered so the
 * most definitive condition wins: an error, then ended, then paused, then the
 * loading/buffering states; only a fully playable element is `PLAYING`.
 */
export function classifyPlayback(state: MediaState): PlaybackState {
  if (state.error) {
    return 'MEDIA_ERROR';
  }
  if (state.ended) {
    return 'ENDED';
  }
  if (state.paused) {
    return 'PAUSED';
  }
  if (state.networkState === NETWORK_LOADING && state.readyState <= HAVE_METADATA) {
    return 'LOADING';
  }
  if (state.readyState < HAVE_ENOUGH_DATA) {
    return 'BUFFERING';
  }
  return 'PLAYING';
}
