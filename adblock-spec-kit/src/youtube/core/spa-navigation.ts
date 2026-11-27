/**
 * SPA navigation manager (Phase 5 — core).
 *
 * YouTube swaps the player without a page reload. This manager debounces the
 * burst of navigation events, re-reads the current player/video references and
 * reports — once per settled navigation and only on a real change — so the
 * engine can reset the ad state, watchdog, recovery budget and audio snapshot
 * for the new video (spec 11.12 / FR-028).
 *
 * It is pure orchestration: the target lookup and the debounce clock are both
 * injected, so the whole thing is deterministic in a test and free of any page
 * global. It never seeks or mutes the new video on its own.
 */

import { TUNING } from '../config/tuning';
import { realTimers, type TimerApi, type TimerHandle } from './timers';

export interface NavTargets {
  readonly player: object | undefined;
  readonly video: object | undefined;
}

export interface NavChange {
  /** True when the `#movie_player` reference is not the one seen last time. */
  readonly playerChanged: boolean;
  /** True when the `video` reference is not the one seen last time. */
  readonly videoChanged: boolean;
}

export interface SpaNavigationDeps {
  /** Reads the current player/video references (may return undefined). */
  readonly getTargets: () => NavTargets;
  /** Called once per settled navigation that actually changed a reference. */
  readonly onNavigate: (change: NavChange) => void;
  /** Debounce window (default `TUNING.navDebounceMs`). */
  readonly debounceMs?: number;
  readonly timers?: TimerApi;
}

export class SpaNavigationManager {
  private readonly deps: SpaNavigationDeps;
  private readonly debounceMs: number;
  private readonly timers: TimerApi;
  private last: NavTargets = { player: undefined, video: undefined };
  private pending: TimerHandle | null = null;
  private disposed = false;

  constructor(deps: SpaNavigationDeps) {
    this.deps = deps;
    this.debounceMs = deps.debounceMs ?? TUNING.navDebounceMs;
    this.timers = deps.timers ?? realTimers;
  }

  /** Records a navigation event; the actual flush happens after the debounce. */
  notify(): void {
    if (this.disposed) {
      return;
    }
    if (this.pending !== null) {
      this.timers.clearTimeout(this.pending);
    }
    this.pending = this.timers.setTimeout(() => {
      this.pending = null;
      this.flush();
    }, this.debounceMs);
  }

  /**
   * Evaluates the navigation immediately (also used by the debounce timer).
   * Reports only when the player or video reference changed.
   */
  flush(): void {
    if (this.disposed) {
      return;
    }
    const next = this.readTargets();
    const change: NavChange = {
      playerChanged: next.player !== this.last.player,
      videoChanged: next.video !== this.last.video,
    };
    this.last = next;
    if (change.playerChanged || change.videoChanged) {
      try {
        this.deps.onNavigate(change);
      } catch {
        // fail-open: a faulty consumer must not break navigation bookkeeping.
      }
    }
  }

  /** The references seen at the last flush. */
  lastTargets(): NavTargets {
    return this.last;
  }

  dispose(): void {
    if (this.pending !== null) {
      this.timers.clearTimeout(this.pending);
      this.pending = null;
    }
    this.disposed = true;
  }

  private readTargets(): NavTargets {
    try {
      return this.deps.getTargets();
    } catch {
      return { player: undefined, video: undefined };
    }
  }
}
