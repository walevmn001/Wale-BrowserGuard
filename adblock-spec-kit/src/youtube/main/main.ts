/**
 * MAIN-world entry for the rebuilt YouTube engine (Phase 1–5).
 *
 * `bootYouTubeEngine` is the single world-aware entry point: it is the only
 * file in the engine that reads page globals, and it accepts an injected `win`
 * so it can be driven in tests. Everything it builds (flags, logger, lifecycle,
 * registries, module registry) is pure logic; the modules it registers are the
 * Phase 1–3 data hooks — the JSON-pruner player hook, the fetch hook and the
 * XHR hook — plus the Phase 4–5 runtime modules: playback watchdog (+ recovery),
 * DOM observer, SPA navigation and the cosmetic CSS hider.
 *
 * It is idempotent (a guard on `win`) and absolutely fail-open: the whole boot
 * runs inside a try/catch and never throws into the page. The engine starts on
 * the A-3 default (all ON) and then applies the snapshot the ISOLATED bridge
 * publishes onto the shared root attribute (the T004 dataset transport), so a
 * saved "off" takes effect on the live page without a reload.
 */

import { DatasetAdapter, type AttributeObserver, type AttributeTarget } from '../adapter/dataset-adapter';
import { FeatureFlags } from '../config/flags';
import { TUNING } from '../config/tuning';
import { DebugLogger } from '../core/debug-logger';
import { LifecycleManager } from '../core/lifecycle-manager';
import { ModuleRegistry } from '../core/registry';
import { pruneJson } from '../core/json-pruner';
import { createEndpointRegistry } from '../registry/endpoints';
import { createSelectorRegistry } from '../registry/selectors';
import type { ModuleContext, ModuleStatus, YouTubeModule } from '../core/module';
import { createAdControlModule } from './ad-control-module';
import { createFetchInterceptor, type FetchLike } from './fetch-interceptor';
import { createXhrInterceptor, type XhrConstructor } from './xhr-interceptor';
import { installPlayerResponseHook, type PlayerHookTarget } from './player-response-hook';
import {
  createCssModule,
  createObserverModule,
  createSpaModule,
  createWatchdogModule,
} from './runtime-modules';

/** Guard key on the window that makes boot idempotent. */
const ENGINE_GUARD = '__wgYtEngine';

/**
 * Player-response ad keys. Mirrors `data/youtube-config.json` `adFields`; kept
 * inline because the MAIN world must not read extension files.
 */
const AD_FIELD_KEYS: readonly string[] = ['adPlacements', 'playerAds', 'adSlots'];

interface EngineHandle {
  status(): unknown;
  dispose(): void;
}

type PruneAdFields = (rawText: string) => { readonly text: string; readonly removed: number } | null;

export function bootYouTubeEngine(win: Window = window): { dispose(): void } | undefined {
  try {
    const scope = win as unknown as Record<string, unknown>;
    const existing = scope[ENGINE_GUARD];
    if (isEngineHandle(existing)) {
      return { dispose: () => existing.dispose() };
    }

    const flags = new FeatureFlags();
    const logger = new DebugLogger();
    const lifecycle = new LifecycleManager();
    const selectors = createSelectorRegistry();
    const endpoints = createEndpointRegistry();
    const registry = new ModuleRegistry();

    const limits = { maxDepth: TUNING.pruneMaxDepth, maxKeys: TUNING.pruneMaxKeys };

    const pruneAdFields: PruneAdFields = (rawText) => {
      try {
        const parsed: unknown = JSON.parse(rawText);
        const result = pruneJson(parsed, AD_FIELD_KEYS, limits);
        if (result.removed <= 0) {
          return null;
        }
        return { text: JSON.stringify(parsed), removed: result.removed };
      } catch {
        return null;
      }
    };

    const isAdFieldPresent = (rawText: string): boolean => {
      for (const key of AD_FIELD_KEYS) {
        if (rawText.includes(`"${key}"`)) {
          return true;
        }
      }
      return false;
    };

    const prunePlayerValue = (value: unknown): unknown =>
      pruneJson(value, AD_FIELD_KEYS, limits).value;

    registry.register(createPlayerHookModule(win, flags, logger, prunePlayerValue));
    if (flags.get('ENABLE_FETCH_HOOK')) {
      registry.register(createFetchModule(win, flags, logger, pruneAdFields, isAdFieldPresent));
    }
    if (flags.get('ENABLE_XHR_HOOK')) {
      registry.register(createXhrModule(win, flags, logger, pruneAdFields, isAdFieldPresent));
    }

    // Phase 4–5 runtime modules. Each is self-gated by its own flag as well.
    registry.register(createWatchdogModule(win, flags, logger, selectors));
    registry.register(createObserverModule(win, flags, logger, selectors));
    registry.register(createSpaModule(win, flags, logger, selectors));
    registry.register(createCssModule(win, flags, logger, selectors));

    // Phase 1–3 ad control (skip / fast-forward parity with the retired module).
    registry.register(createAdControlModule(win, flags, logger, selectors));

    const ctx: ModuleContext = { flags, logger, lifecycle, selectors, endpoints };
    void registry.initAll(ctx);

    // T004: apply the ISOLATED bridge's flag snapshot from the shared root
    // attribute. Booted once the root exists; until then the A-3 defaults hold.
    let adapter: DatasetAdapter | undefined;
    let adapterWaiter: MutationObserver | undefined;
    const bootAdapter = (): void => {
      try {
        const root = win.document.documentElement as HTMLElement | null;
        const Ctor = (win as unknown as {
          MutationObserver: new (cb: () => void) => MutationObserver;
        }).MutationObserver;
        if (root === null) {
          const localWaiter = new Ctor(() => {
            if ((win.document.documentElement as HTMLElement | null) !== null) {
              localWaiter.disconnect();
              adapterWaiter = undefined;
              bootAdapter();
            }
          });
          adapterWaiter = localWaiter;
          localWaiter.observe(win.document, { childList: true });
          return;
        }
        const target: AttributeTarget = root;
        adapter = new DatasetAdapter({
          target,
          createObserver: (callback): AttributeObserver => new Ctor(callback),
        });
        adapter.onReceive((raw) => {
          try {
            flags.applyRemote(raw);
          } catch {
            // fail-open: a bad snapshot can only leave the defaults in place.
          }
        });
        adapter.start();
      } catch {
        // fail-open
      }
    };
    bootAdapter();

    const handle: EngineHandle = {
      status: () => registry.statusAll(),
      dispose: () => {
        try {
          void registry.disposeAll();
        } catch {
          // fail-open
        }
        try {
          lifecycle.disposeAll();
        } catch {
          // fail-open
        }
        try {
          adapter?.dispose();
          adapterWaiter?.disconnect();
        } catch {
          // fail-open
        }
      },
    };

    try {
      Object.defineProperty(scope, ENGINE_GUARD, {
        value: handle,
        configurable: true,
        enumerable: false,
      });
    } catch {
      try {
        scope[ENGINE_GUARD] = handle;
      } catch {
        // fail-open: the engine still runs even without a debug handle.
      }
    }

    return { dispose: () => handle.dispose() };
  } catch {
    return undefined;
  }
}

function isEngineHandle(value: unknown): value is EngineHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { dispose?: unknown }).dispose === 'function' &&
    typeof (value as { status?: unknown }).status === 'function'
  );
}

function createPlayerHookModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  pruner: (value: unknown) => unknown,
): YouTubeModule {
  let enabled = false;
  const name = 'json-pruner';
  return {
    name,
    init(): void {
      enabled = flags.get('ENABLE_JSON_PRUNER');
      if (!enabled) {
        return;
      }
      installPlayerResponseHook(win as unknown as PlayerHookTarget, { flags, logger, pruner });
    },
    dispose(): void {
      enabled = false;
    },
    status(): ModuleStatus {
      return { name, enabled, failures: 0, lastError: null };
    },
  };
}

function createFetchModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  pruneAdFields: PruneAdFields,
  isAdFieldPresent: (rawText: string) => boolean,
): YouTubeModule {
  let enabled = false;
  let original: FetchLike | undefined;
  const name = 'fetch-interceptor';
  return {
    name,
    init(): void {
      enabled = flags.get('ENABLE_FETCH_HOOK');
      if (!enabled) {
        return;
      }
      const target = win as unknown as { fetch?: FetchLike };
      const nativeFetch = target.fetch;
      if (typeof nativeFetch !== 'function') {
        return;
      }
      original = nativeFetch;
      const interceptor = createFetchInterceptor({ flags, logger, pruneAdFields, isAdFieldPresent });
      // Keep the native `this` (window): the original fetch can be illegal when
      // called unbound.
      const bound: FetchLike = (input, init) => nativeFetch.call(win, input, init);
      target.fetch = interceptor.wrap(bound);
    },
    dispose(): void {
      const target = win as unknown as { fetch?: FetchLike };
      if (original !== undefined) {
        target.fetch = original;
      }
      original = undefined;
      enabled = false;
    },
    status(): ModuleStatus {
      return { name, enabled, failures: 0, lastError: null };
    },
  };
}

function createXhrModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  pruneAdFields: PruneAdFields,
  isAdFieldPresent: (rawText: string) => boolean,
): YouTubeModule {
  let enabled = false;
  let original: XhrConstructor | undefined;
  const name = 'xhr-interceptor';
  return {
    name,
    init(): void {
      enabled = flags.get('ENABLE_XHR_HOOK');
      if (!enabled) {
        return;
      }
      const target = win as unknown as { XMLHttpRequest?: XhrConstructor };
      const nativeXhr = target.XMLHttpRequest;
      if (typeof nativeXhr !== 'function') {
        return;
      }
      original = nativeXhr;
      const interceptor = createXhrInterceptor({ flags, logger, pruneAdFields, isAdFieldPresent });
      target.XMLHttpRequest = interceptor.wrap(nativeXhr);
    },
    dispose(): void {
      const target = win as unknown as { XMLHttpRequest?: XhrConstructor };
      if (original !== undefined) {
        target.XMLHttpRequest = original;
      }
      original = undefined;
      enabled = false;
    },
    status(): ModuleStatus {
      return { name, enabled, failures: 0, lastError: null };
    },
  };
}
