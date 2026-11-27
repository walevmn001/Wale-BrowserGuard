/**
 * Playback watchdog (Phase 4 — core).
 *
 * Pure, DOM-free stall detector (spec 11.10 / FR-026). It samples a media
 * element's `currentTime` and decides whether playback has genuinely stopped
 * advancing, while carefully NOT flagging the benign cases:
 *
 *  - the user paused (`paused`) or the video ended (`ended`) — reset, never a stall;
 *  - a short buffering hiccup — the `readyState` is still climbing, so it counts
 *    as progress, and even a flat buffer must persist past `stallMs` first;
 *  - a media element that is missing — nothing to watch, reset.
 *
 * It is a *reader*: it never seeks, reloads or touches `paused`/`playbackRate`
 * (spec 11.10 — "watchdog không tự seek hoặc reload"). Its only output is a
 * signal the state machine / recovery layer consumes.
 *
 * The element is only ever reached through the injected `WatchdogElement`
 * interface, and a `WeakSet` guarantees each element gets exactly one set of
 * listeners no matter how often `attach` is called (spec 11.10 — "không có
 * listener trùng").
 */

import { TUNING } from '../config/tuning';

/** The media counters the watchdog reads (a subset of `HTMLMediaElement`). */
export interface WatchdogMedia {
  readonly currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  readonly readyState: number;
  readonly networkState: number;
  /** `video.error`, or any non-null value when the element has a media error. */
  readonly error: unknown;
}

/** A media element the watchdog can attach progress listeners to. */
export interface WatchdogElement extends WatchdogMedia {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export type WatchdogSignal =
  | { readonly type: 'STALLED'; readonly stalledMs: number }
  | { readonly type: 'MEDIA_ERROR' };

/** Media events that indicate the element is doing something; each clears idle time. */
export const WATCHDOG_EVENTS = ['waiting', 'stalled', 'playing', 'canplay', 'error', 'emptied'] as const;

export interface WatchdogOptions {
  /** Non-advancing time before a stall is reported (default `TUNING.stallMs`). */
  readonly stallMs?: number;
}

export class PlaybackWatchdog {
  private readonly stallMs: number;
  private readonly attached = new WeakSet<object>();
  private lastTime: number | null = null;
  private lastSampleAt: number | null = null;
  private lastReadyState: number | null = null;
  private idleMs = 0;
  private stalledLatched = false;
  private errorLatched = false;

  constructor(opts: WatchdogOptions = {}) {
    this.stallMs = opts.stallMs ?? TUNING.stallMs;
  }

  /** True when listeners are already attached to `element`. */
  isAttached(element: object): boolean {
    return this.attached.has(element);
  }

  /**
   * Attaches the progress listeners to `element` once. A second call for the
   * same element is a no-op that returns a no-op detach. The returned function
   * removes exactly the listeners this call added.
   */
  attach(element: WatchdogElement): () => void {
    if (this.attached.has(element)) {
      return () => {
        // already attached by an earlier call; nothing to undo here.
      };
    }
    this.attached.add(element);
    const pairs: Array<[string, () => void]> = [];
    for (const type of WATCHDOG_EVENTS) {
      const handler = (): void => {
        this.noteActivity();
      };
      try {
        element.addEventListener(type, handler);
        pairs.push([type, handler]);
      } catch {
        // fail-open: a hostile element just gets fewer listeners.
      }
    }
    return () => {
      for (const [type, handler] of pairs) {
        try {
          element.removeEventListener(type, handler);
        } catch {
          // fail-open
        }
      }
      this.attached.delete(element);
    };
  }

  /** Idle time accumulated so far, in milliseconds. */
  stalledForMs(): number {
    return this.idleMs;
  }

  /**
   * Feeds one sample. Returns a signal only on a *new* stall or media error
   * (both are latched until progress resumes), otherwise `null`.
   */
  sample(media: WatchdogMedia | undefined, now: number): WatchdogSignal | null {
    if (media === undefined) {
      this.resetProgress();
      this.errorLatched = false;
      return null;
    }

    if (media.error !== null && media.error !== undefined) {
      this.resetProgress();
      if (!this.errorLatched) {
        this.errorLatched = true;
        return { type: 'MEDIA_ERROR' };
      }
      return null;
    }
    this.errorLatched = false;

    // A paused or ended element is not stalling — the user or the video controls it.
    if (media.paused || media.ended) {
      this.resetProgress();
      return null;
    }

    // A rising readyState means buffering is making progress: treat as activity.
    const readyRising = this.lastReadyState !== null && media.readyState > this.lastReadyState;
    this.lastReadyState = media.readyState;

    if (this.lastTime === null || media.currentTime !== this.lastTime) {
      this.lastTime = media.currentTime;
      this.lastSampleAt = now;
      this.resetStall();
      return null;
    }

    // currentTime is unchanged since the previous sample.
    if (readyRising) {
      this.lastSampleAt = now;
      this.resetStall();
      return null;
    }
    if (this.lastSampleAt === null) {
      this.lastSampleAt = now;
      return null;
    }
    this.idleMs += Math.max(0, now - this.lastSampleAt);
    this.lastSampleAt = now;

    if (this.idleMs >= this.stallMs && !this.stalledLatched) {
      this.stalledLatched = true;
      return { type: 'STALLED', stalledMs: this.idleMs };
    }
    return null;
  }

  /** Clears all detection state, e.g. after a player replacement. */
  reset(): void {
    this.resetProgress();
    this.errorLatched = false;
  }

  private noteActivity(): void {
    // An event (playing, canplay, …) resets the baseline so the next sample is fresh.
    this.lastTime = null;
    this.lastSampleAt = null;
    this.resetStall();
  }

  private resetStall(): void {
    this.idleMs = 0;
    this.stalledLatched = false;
  }

  private resetProgress(): void {
    this.lastTime = null;
    this.lastSampleAt = null;
    this.lastReadyState = null;
    this.resetStall();
  }
}
