/**
 * DOM observer (Phase 5 — core).
 *
 * Wraps a `MutationObserver` behind an injected factory so the whole debounce /
 * lifecycle logic is unit-testable without a browser. It observes a single
 * player-scoped root (never the whole page body) for `childList` and
 * `class` attribute changes, coalesces a burst of mutations into one debounced
 * notification, and exposes an idempotent `disconnect`.
 *
 * It is strictly a *reader*: the callback must not mutate the DOM it watches
 * (spec 11.13 — "observer không thay đổi DOM mà quan sát"), which is what keeps
 * it from looping. The callback only notifies; the periodic runtime read is
 * still the watchdog's job.
 */

import { TUNING } from '../config/tuning';
import { realTimers, type TimerApi, type TimerHandle } from './timers';

export interface ObserverInit {
  readonly childList?: boolean;
  readonly attributes?: boolean;
  readonly attributeFilter?: readonly string[];
  readonly subtree?: boolean;
}

/** The subset of `MutationObserver` this module needs; injected for tests. */
export interface ObserverLike {
  observe(target: object, options: ObserverInit): void;
  disconnect(): void;
}

export interface DomObserverDeps {
  /** Builds the underlying observer, e.g. `(cb) => new MutationObserver(cb)`. */
  readonly createObserver: (callback: () => void) => ObserverLike;
  /** Called (debounced) when an observed change happens. */
  readonly onNotify: () => void;
  /** Debounce window (default `TUNING.observerDebounceMs`). */
  readonly debounceMs?: number;
  readonly timers?: TimerApi;
}

/** Only `class` is watched — the player's ad state lives in its class list. */
const ATTRIBUTE_FILTER: readonly string[] = ['class'];

export class DomObserver {
  private readonly deps: DomObserverDeps;
  private readonly debounceMs: number;
  private readonly timers: TimerApi;
  private observer: ObserverLike | null = null;
  private pending: TimerHandle | null = null;

  constructor(deps: DomObserverDeps) {
    this.deps = deps;
    this.debounceMs = deps.debounceMs ?? TUNING.observerDebounceMs;
    this.timers = deps.timers ?? realTimers;
  }

  /** Starts (or restarts) observing `target`. A previous observer is disconnected. */
  observe(target: object): void {
    this.disconnect();
    let created: ObserverLike;
    try {
      created = this.deps.createObserver(() => {
        this.schedule();
      });
      created.observe(target, {
        childList: true,
        attributes: true,
        attributeFilter: ATTRIBUTE_FILTER,
      });
    } catch {
      // fail-open: if the target cannot be observed, stay disconnected.
      return;
    }
    this.observer = created;
  }

  /** True while an observer is attached. */
  isObserving(): boolean {
    return this.observer !== null;
  }

  /** Stops observing and cancels any pending notification. Idempotent. */
  disconnect(): void {
    if (this.pending !== null) {
      this.timers.clearTimeout(this.pending);
      this.pending = null;
    }
    if (this.observer !== null) {
      try {
        this.observer.disconnect();
      } catch {
        // fail-open
      }
      this.observer = null;
    }
  }

  dispose(): void {
    this.disconnect();
  }

  private schedule(): void {
    if (this.pending !== null) {
      this.timers.clearTimeout(this.pending);
    }
    this.pending = this.timers.setTimeout(() => {
      this.pending = null;
      try {
        this.deps.onNotify();
      } catch {
        // fail-open: a faulty consumer must not break the observer.
      }
    }, this.debounceMs);
  }
}
