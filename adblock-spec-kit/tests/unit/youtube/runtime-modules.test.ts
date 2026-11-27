import { describe, expect, it } from 'vitest';

import { DEFAULT_FLAGS, FeatureFlags, type FlagName } from '../../../src/youtube/config/flags';
import { TUNING } from '../../../src/youtube/config/tuning';
import { DebugLogger } from '../../../src/youtube/core/debug-logger';
import type { ObserverInit, ObserverLike } from '../../../src/youtube/core/dom-observer';
import type { YouTubeModule } from '../../../src/youtube/core/module';
import { STYLE_ELEMENT_ID } from '../../../src/youtube/core/css-hider';
import { createSelectorRegistry } from '../../../src/youtube/registry/selectors';
import { bootYouTubeEngine } from '../../../src/youtube/main/main';
import {
  createCssModule,
  createObserverModule,
  createSpaModule,
  createWatchdogModule,
} from '../../../src/youtube/main/runtime-modules';

/**
 * The Phase 4–5 modules read their deps from closures and ignore `init`'s ctx,
 * so start them without building a full `ModuleContext`.
 */
function start(module: YouTubeModule): void {
  (module.init as unknown as () => void)();
}

// ---------------------------------------------------------------------------
// Minimal fake DOM/window — just enough for the Phase 4–5 wiring to run.
// ---------------------------------------------------------------------------

class FakeClassList {
  private readonly set: Set<string>;
  constructor(initial: readonly string[] = []) {
    this.set = new Set(initial);
  }
  contains(name: string): boolean {
    return this.set.has(name);
  }
}

class FakeStyle {
  id = '';
  textContent = '';
  removed = false;
  constructor(private readonly doc: FakeDocument) {}
  remove(): void {
    this.removed = true;
    this.doc.unregister(this.id);
  }
}

class FakeVideo {
  paused = false;
  ended = false;
  readyState = 4;
  networkState = 1;
  error: unknown = null;
  currentTime = 10;
  readonly buffered = { length: 1, start: () => 0, end: () => 20 };
  private readonly listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakePlayer {
  readonly classList: FakeClassList;
  constructor(classes: readonly string[] = []) {
    this.classList = new FakeClassList(classes);
  }
}

class FakeDocument {
  player: FakePlayer | undefined;
  video: FakeVideo | undefined;
  private readonly byId = new Map<string, unknown>();
  readonly head = {
    appendChild: (el: FakeStyle): FakeStyle => {
      this.byId.set(el.id, el);
      return el;
    },
  };
  readonly documentElement = {
    appendChild: (el: FakeStyle): FakeStyle => {
      this.byId.set(el.id, el);
      return el;
    },
  };
  querySelector(selector: string): unknown {
    if (selector === '#movie_player') {
      return this.player ?? null;
    }
    if (selector === 'video') {
      return this.video ?? null;
    }
    return null;
  }
  getElementById(id: string): unknown {
    return this.byId.get(id) ?? null;
  }
  createElement(tag: string): unknown {
    return tag === 'style' ? new FakeStyle(this) : {};
  }
  unregister(id: string): void {
    this.byId.delete(id);
  }
}

class FakeMutationObserver implements ObserverLike {
  static instances: FakeMutationObserver[] = [];
  readonly observeCalls: object[] = [];
  disconnectCalls = 0;
  constructor(_callback: () => void) {
    FakeMutationObserver.instances.push(this);
  }
  observe(target: object, _options: ObserverInit): void {
    this.observeCalls.push(target);
  }
  disconnect(): void {
    this.disconnectCalls += 1;
  }
}

class FakeWin {
  readonly document = new FakeDocument();
  readonly MutationObserver = FakeMutationObserver;
  fetch = async (): Promise<Response> => new Response('', { status: 200 });
  XMLHttpRequest: new () => unknown = class {};
  intervalFn: (() => void) | null = null;
  intervalMs: number | null = null;
  clearCount = 0;
  private readonly listeners = new Map<string, Set<() => void>>();

  setInterval(fn: () => void, ms: number): number {
    this.intervalFn = fn;
    this.intervalMs = ms;
    return 7;
  }
  clearInterval(): void {
    this.clearCount += 1;
    this.intervalFn = null;
  }
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
  asWindow(): Window {
    return this as unknown as Window;
  }
}

function makeWin(): FakeWin {
  FakeMutationObserver.instances = [];
  return new FakeWin();
}

function makeFlags(overrides: Partial<Record<FlagName, boolean>> = {}): FeatureFlags {
  return new FeatureFlags({ ...DEFAULT_FLAGS, ...overrides });
}

// ---------------------------------------------------------------------------
// CSS hider
// ---------------------------------------------------------------------------

describe('createCssModule', () => {
  it('injects one style, avoids a duplicate, and removes it on dispose', () => {
    const win = makeWin();
    const flags = makeFlags();
    const logger = new DebugLogger();
    const selectors = createSelectorRegistry();

    const module = createCssModule(win.asWindow(), flags, logger, selectors);
    start(module);

    const style = win.document.getElementById(STYLE_ELEMENT_ID) as FakeStyle | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain('display: none !important');
    expect(style!.textContent).toContain('.ytp-ad-module');

    // A second module must not inject a duplicate.
    const other = createCssModule(win.asWindow(), flags, logger, selectors);
    start(other);
    expect(win.document.getElementById(STYLE_ELEMENT_ID)).toBe(style);

    module.dispose();
    expect(style!.removed).toBe(true);
    expect(win.document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it('does nothing when the flag is off', () => {
    const win = makeWin();
    const module = createCssModule(
      win.asWindow(),
      makeFlags({ ENABLE_CSS_HIDER: false }),
      new DebugLogger(),
      createSelectorRegistry(),
    );
    start(module);
    expect(win.document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DOM observer
// ---------------------------------------------------------------------------

describe('createObserverModule', () => {
  it('observes the player when enabled and disconnects on dispose', () => {
    const win = makeWin();
    win.document.player = new FakePlayer();
    const module = createObserverModule(win.asWindow(), makeFlags(), new DebugLogger(), createSelectorRegistry());
    start(module);

    const observer = FakeMutationObserver.instances.at(-1);
    expect(observer).toBeDefined();
    expect(observer!.observeCalls[0]).toBe(win.document.player);

    module.dispose();
    expect(observer!.disconnectCalls).toBeGreaterThanOrEqual(1);
  });

  it('does not observe when the flag is off', () => {
    const win = makeWin();
    win.document.player = new FakePlayer();
    const module = createObserverModule(
      win.asWindow(),
      makeFlags({ ENABLE_DOM_OBSERVER: false }),
      new DebugLogger(),
      createSelectorRegistry(),
    );
    start(module);
    expect(FakeMutationObserver.instances).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SPA navigation
// ---------------------------------------------------------------------------

describe('createSpaModule', () => {
  it('subscribes to navigation events when enabled and detaches on dispose', () => {
    const win = makeWin();
    const module = createSpaModule(win.asWindow(), makeFlags(), new DebugLogger(), createSelectorRegistry());
    start(module);

    expect(win.listenerCount('yt-navigate-finish')).toBe(1);
    expect(win.listenerCount('popstate')).toBe(1);

    module.dispose();
    expect(win.listenerCount('yt-navigate-finish')).toBe(0);
    expect(win.listenerCount('popstate')).toBe(0);
  });

  it('does not subscribe when the flag is off', () => {
    const win = makeWin();
    const module = createSpaModule(
      win.asWindow(),
      makeFlags({ ENABLE_SPA_NAVIGATION: false }),
      new DebugLogger(),
      createSelectorRegistry(),
    );
    start(module);
    expect(win.listenerCount('yt-navigate-finish')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Playback watchdog (+ recovery)
// ---------------------------------------------------------------------------

describe('createWatchdogModule', () => {
  it('starts the sampler interval when enabled and clears it on dispose', () => {
    const win = makeWin();
    const module = createWatchdogModule(win.asWindow(), makeFlags(), new DebugLogger(), createSelectorRegistry());
    start(module);

    expect(win.intervalMs).toBe(TUNING.watchdogPollMs);
    expect(win.intervalFn).not.toBeNull();

    module.dispose();
    expect(win.clearCount).toBeGreaterThanOrEqual(1);
    expect(win.intervalFn).toBeNull();
  });

  it('does not start when the flag is off', () => {
    const win = makeWin();
    const module = createWatchdogModule(
      win.asWindow(),
      makeFlags({ ENABLE_PLAYBACK_WATCHDOG: false }),
      new DebugLogger(),
      createSelectorRegistry(),
    );
    start(module);
    expect(win.intervalFn).toBeNull();
  });

  it('samples safely when no player/video is present', () => {
    const win = makeWin();
    const module = createWatchdogModule(win.asWindow(), makeFlags(), new DebugLogger(), createSelectorRegistry());
    start(module);
    expect(() => win.intervalFn?.()).not.toThrow();
    module.dispose();
  });
});

// ---------------------------------------------------------------------------
// Boot registration
// ---------------------------------------------------------------------------

describe('bootYouTubeEngine — Phase 4–5 registration', () => {
  interface StatusLike {
    readonly name: string;
  }
  function engineOf(win: FakeWin): { status(): readonly StatusLike[] } | undefined {
    return (win as unknown as { __wgYtEngine?: { status(): readonly StatusLike[] } }).__wgYtEngine;
  }

  it('registers the runtime modules and exposes their status', async () => {
    const win = makeWin();
    win.document.player = new FakePlayer();
    win.document.video = new FakeVideo();

    const handle = bootYouTubeEngine(win.asWindow());
    expect(handle).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const names = engineOf(win)!.status().map((status) => status.name);
    expect(names).toEqual(
      expect.arrayContaining(['playback-watchdog', 'dom-observer', 'spa-navigation', 'css-hider']),
    );
    expect(win.document.getElementById(STYLE_ELEMENT_ID)).not.toBeNull();

    handle!.dispose();
  });

  it('is idempotent across boots', () => {
    const win = makeWin();
    const first = bootYouTubeEngine(win.asWindow());
    const second = bootYouTubeEngine(win.asWindow());

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(() => second!.dispose()).not.toThrow();
  });
});
