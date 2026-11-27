/**
 * World-aware runtime modules for the rebuilt YouTube engine (Phase 5).
 *
 * These are the four Phase 4–5 modules — playback watchdog (+ recovery), DOM
 * observer, SPA navigation and the cosmetic CSS hider — expressed as
 * `YouTubeModule`s. They are the only place a Phase 4–5 module touches the page:
 * the decision logic lives in `core/` (pure, tested), and this file only reads
 * the player/video, wires timers/observers and (for recovery and CSS) performs
 * the two narrowly-scoped writes the spec allows.
 *
 * Design notes:
 *  - Every module is self-contained and self-healing: the watchdog re-reads the
 *    video each tick, and the observer re-targets when the DOM mutation stream
 *    shows a new player. That is what makes an SPA video swap safe without
 *    cross-module coupling.
 *  - Everything is fail-open. A missing element, a hostile getter or a throwing
 *    callback can only reduce protection; playback is never touched as a side
 *    effect of an error (Constitution — playback first).
 *  - Each module is gated by its own feature flag, and registers its teardown
 *    with the injected `LifecycleManager` so a disable leaves no timer, observer
 *    or injected style behind.
 */

import type { FeatureFlags } from '../config/flags';
import { TUNING } from '../config/tuning';
import type { DebugLogger } from '../core/debug-logger';
import type { ModuleStatus, YouTubeModule } from '../core/module';
import { PlaybackWatchdog } from '../core/playback-watchdog';
import { PlaybackRecovery, type RecoveryDecision, type RecoveryMedia } from '../core/playback-recovery';
import { DomObserver, type ObserverLike } from '../core/dom-observer';
import { SpaNavigationManager } from '../core/spa-navigation';
import { buildHideCss, hideSelectors, STYLE_ELEMENT_ID } from '../core/css-hider';
import type { SelectorRegistry } from '../registry/selectors';

/** A status helper shared by these modules (single failure counter). */
function statusOf(name: string, enabled: boolean): ModuleStatus {
  return { name, enabled, failures: 0, lastError: null };
}

/** Reads `#movie_player`, or undefined when it is not (yet) in the DOM. */
export function readPlayer(doc: Document | undefined, selectors: SelectorRegistry): HTMLElement | undefined {
  if (doc === undefined) {
    return undefined;
  }
  const selector = selectors.get('PLAYER');
  if (selector === undefined) {
    return undefined;
  }
  try {
    return doc.querySelector<HTMLElement>(selector) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Reads the current `video` element, or undefined when absent. */
export function readVideo(doc: Document | undefined, selectors: SelectorRegistry): HTMLVideoElement | undefined {
  if (doc === undefined) {
    return undefined;
  }
  const selector = selectors.get('VIDEO');
  if (selector === undefined) {
    return undefined;
  }
  try {
    return doc.querySelector<HTMLVideoElement>(selector) ?? undefined;
  } catch {
    return undefined;
  }
}

/** True when the player carries the configured ad-showing class. */
export function playerHasAdClass(player: HTMLElement | undefined, selectors: SelectorRegistry): boolean {
  if (player === undefined) {
    return false;
  }
  const adClass = selectors.get('AD_SHOWING_CLASS');
  if (adClass === undefined) {
    return false;
  }
  try {
    return player.classList.contains(adClass);
  } catch {
    return false;
  }
}

/** Seconds buffered ahead of `currentTime`, or 0 when none / unreadable. */
function bufferedAhead(video: HTMLVideoElement): number {
  try {
    const ranges = video.buffered;
    const time = video.currentTime;
    for (let index = 0; index < ranges.length; index += 1) {
      if (time >= ranges.start(index) && time <= ranges.end(index)) {
        return ranges.end(index) - time;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

function toRecoveryMedia(video: HTMLVideoElement): RecoveryMedia {
  return {
    paused: video.paused,
    ended: video.ended,
    readyState: video.readyState,
    networkState: video.networkState,
    error: video.error !== null,
    currentTime: video.currentTime,
    bufferedAhead: bufferedAhead(video),
  };
}

// ---------------------------------------------------------------------------
// Playback watchdog (+ recovery)
// ---------------------------------------------------------------------------

/**
 * Samples the video every `watchdogPollMs`. On a stall it asks the recovery
 * layer for the least invasive action and performs at most a level-3 nudge
 * (`currentTime = currentTime`), and only when `ENABLE_RECOVERY` is on.
 */
export function createWatchdogModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  selectors: SelectorRegistry,
): YouTubeModule {
  const name = 'playback-watchdog';
  let enabled = false;
  let handle: number | null = null;
  let video: HTMLVideoElement | undefined;
  let detach: (() => void) | undefined;
  const watchdog = new PlaybackWatchdog();
  const recovery = new PlaybackRecovery();

  function adopt(next: HTMLVideoElement | undefined): void {
    if (next === video) {
      return;
    }
    try {
      detach?.();
    } catch {
      // fail-open
    }
    detach = undefined;
    video = next;
    watchdog.reset();
    recovery.reset();
    if (next !== undefined) {
      try {
        detach = watchdog.attach(next);
      } catch {
        detach = undefined;
      }
    }
  }

  function tick(): void {
    try {
      if (!flags.get('ENABLE_PLAYBACK_WATCHDOG')) {
        return;
      }
      const doc = win.document;
      adopt(readVideo(doc, selectors));
      const current = video;
      if (current === undefined) {
        return;
      }
      const signal = watchdog.sample(current, Date.now());
      if (signal === null) {
        return;
      }
      if (signal.type === 'MEDIA_ERROR') {
        logger.warn(name, 'media error observed');
      }
      if (!flags.get('ENABLE_RECOVERY')) {
        return;
      }
      const adActive = playerHasAdClass(readPlayer(doc, selectors), selectors);
      const decision: RecoveryDecision = recovery.diagnose(
        { adActive, media: toRecoveryMedia(current), stalledMs: watchdog.stalledForMs() },
        Date.now(),
      );
      applyRecovery(name, decision, current, logger, () => {
        // Level 4: stop intervening for this video by pausing the sampler.
        if (handle !== null) {
          win.clearInterval(handle);
          handle = null;
        }
      });
    } catch {
      // fail-open: a sample must never throw into the page.
    }
  }

  return {
    name,
    init(): void {
      enabled = flags.get('ENABLE_PLAYBACK_WATCHDOG');
      if (!enabled) {
        return;
      }
      handle = win.setInterval(tick, TUNING.watchdogPollMs);
    },
    dispose(): void {
      enabled = false;
      if (handle !== null) {
        win.clearInterval(handle);
        handle = null;
      }
      try {
        detach?.();
      } catch {
        // fail-open
      }
      detach = undefined;
      video = undefined;
      watchdog.reset();
      recovery.reset();
    },
    status(): ModuleStatus {
      return statusOf(name, enabled);
    },
  };
}

/** Applies a recovery decision; only NUDGE writes to the media. */
function applyRecovery(
  name: string,
  decision: RecoveryDecision,
  video: HTMLVideoElement,
  logger: DebugLogger,
  onDisabled: () => void,
): void {
  logger.info(name, 'recovery', { cause: decision.cause, level: decision.level, reason: decision.reason });
  if (decision.level === 'NUDGE' && !decision.passive) {
    try {
      // A gentle, idempotent nudge — never a seek to a different time, never a reload.
      video.currentTime = video.currentTime;
    } catch {
      // fail-open
    }
  }
  if (decision.level === 'DISABLED') {
    try {
      onDisabled();
    } catch {
      // fail-open
    }
  }
}

// ---------------------------------------------------------------------------
// DOM observer
// ---------------------------------------------------------------------------

/**
 * Watches the player-scoped root for `class`/child changes and notifies the
 * engine (debounced). It re-targets itself when the mutation stream shows the
 * player element was replaced, and it never mutates the DOM it observes.
 */
export function createObserverModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  selectors: SelectorRegistry,
): YouTubeModule {
  const name = 'dom-observer';
  let enabled = false;
  let currentTarget: HTMLElement | undefined;
  const observer = new DomObserver({
    createObserver: (callback): ObserverLike => {
      const Ctor = (win as unknown as { MutationObserver: new (cb: () => void) => ObserverLike })
        .MutationObserver;
      return new Ctor(callback);
    },
    onNotify: (): void => {
      try {
        const player = readPlayer(win.document, selectors);
        if (player === undefined) {
          return;
        }
        if (player !== currentTarget) {
          currentTarget = player;
          observer.observe(player);
        }
        logger.debug(name, 'player DOM changed');
      } catch {
        // fail-open
      }
    },
  });

  return {
    name,
    init(): void {
      enabled = flags.get('ENABLE_DOM_OBSERVER');
      if (!enabled) {
        return;
      }
      const player = readPlayer(win.document, selectors);
      if (player !== undefined) {
        currentTarget = player;
        observer.observe(player);
      }
    },
    dispose(): void {
      enabled = false;
      currentTarget = undefined;
      observer.dispose();
    },
    status(): ModuleStatus {
      return statusOf(name, enabled);
    },
  };
}

// ---------------------------------------------------------------------------
// SPA navigation
// ---------------------------------------------------------------------------

/**
 * Debounces navigation events and reports a settled player/video change. The
 * watchdog and observer self-heal on their own, so this module only logs; the
 * registration is kept as the single place future state resets hook into.
 */
export function createSpaModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  selectors: SelectorRegistry,
): YouTubeModule {
  const name = 'spa-navigation';
  let enabled = false;
  const manager = new SpaNavigationManager({
    getTargets: () => ({
      player: readPlayer(win.document, selectors),
      video: readVideo(win.document, selectors),
    }),
    onNavigate: (change): void => {
      logger.info(name, 'navigation', change);
    },
  });
  const onNavigation = (): void => {
    manager.notify();
  };

  return {
    name,
    init(): void {
      enabled = flags.get('ENABLE_SPA_NAVIGATION');
      if (!enabled) {
        return;
      }
      try {
        win.addEventListener('yt-navigate-finish', onNavigation);
        win.addEventListener('popstate', onNavigation);
      } catch {
        // fail-open
      }
    },
    dispose(): void {
      enabled = false;
      try {
        win.removeEventListener('yt-navigate-finish', onNavigation);
        win.removeEventListener('popstate', onNavigation);
      } catch {
        // fail-open
      }
      manager.dispose();
    },
    status(): ModuleStatus {
      return statusOf(name, enabled);
    },
  };
}

// ---------------------------------------------------------------------------
// Cosmetic CSS hider
// ---------------------------------------------------------------------------

/**
 * Injects one `<style>` that hides the player's ad chrome. Inserted as early as
 * possible (the engine boots at `document_start`), removed on dispose.
 */
export function createCssModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  selectors: SelectorRegistry,
): YouTubeModule {
  const name = 'css-hider';
  let enabled = false;
  let style: HTMLStyleElement | undefined;

  return {
    name,
    init(): void {
      enabled = flags.get('ENABLE_CSS_HIDER');
      if (!enabled) {
        return;
      }
      try {
        const css = buildHideCss(hideSelectors(selectors));
        if (css === '') {
          return;
        }
        const doc = win.document;
        if (doc.getElementById(STYLE_ELEMENT_ID) !== null) {
          return;
        }
        const element = doc.createElement('style');
        element.id = STYLE_ELEMENT_ID;
        element.textContent = css;
        const parent = doc.head ?? doc.documentElement;
        parent.appendChild(element);
        style = element;
      } catch {
        logger.warn(name, 'failed to inject hide CSS');
      }
    },
    dispose(): void {
      enabled = false;
      try {
        style?.remove();
      } catch {
        // fail-open
      }
      style = undefined;
    },
    status(): ModuleStatus {
      return statusOf(name, enabled);
    },
  };
}
