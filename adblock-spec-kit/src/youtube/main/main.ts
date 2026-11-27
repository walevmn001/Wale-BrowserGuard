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
 * Boot order (CHECKPOINT FIX-01, Phase B):
 *   1. build the flags with the safe A-3 defaults (all ON);
 *   2. start the T004 dataset adapter and apply any snapshot already present, so
 *      a saved "off" is in place *before* the modules init;
 *   3. init the modules — each hook installs against the *current* flag and
 *      subscribes for later changes, so a snapshot that arrives after boot makes
 *      every hook enable/disable itself without a reload;
 *   4. publish the runtime status the popup reads (Phase C handshake).
 *
 * It is idempotent (a guard on `win`) and absolutely fail-open: the whole boot
 * runs inside a try/catch and never throws into the page.
 */

import { DatasetAdapter, type AttributeObserver, type AttributeTarget } from '../adapter/dataset-adapter';
import { FeatureFlags, type FlagName } from '../config/flags';
import { TUNING } from '../config/tuning';
import { DebugLogger } from '../core/debug-logger';
import { LifecycleManager } from '../core/lifecycle-manager';
import { ModuleRegistry } from '../core/registry';
import { pruneJson } from '../core/json-pruner';
import { createEndpointRegistry } from '../registry/endpoints';
import { createSelectorRegistry } from '../registry/selectors';
import { YT_STATUS_ATTRIBUTE } from '../state/runtime-status';
import type { ModuleContext, ModuleStatus, YouTubeModule } from '../core/module';
import { createAdControlModule } from './ad-control-module';
import { createFetchInterceptor, type FetchLike } from './fetch-interceptor';
import { createXhrInterceptor, type XhrConstructor } from './xhr-interceptor';
import {
  installPlayerResponseHook,
  uninstallPlayerResponseHook,
  type PlayerHookTarget,
} from './player-response-hook';
import { createStatusPublisher } from './status-publisher';
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

    // Step 2 (below) needs the root element + observer factory; resolve them
    // lazily so the adapter can be started before the modules init.
    const observerCtor = (win as unknown as {
      MutationObserver: new (cb: () => void) => MutationObserver;
    }).MutationObserver;

    let adapter: DatasetAdapter | undefined;
    let adapterWaiter: MutationObserver | undefined;
    const bootAdapter = (): void => {
      try {
        const root = win.document.documentElement as HTMLElement | null;
        if (root === null) {
          const localWaiter = new observerCtor(() => {
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
          createObserver: (callback): AttributeObserver => new observerCtor(callback),
        });
        adapter.onReceive((raw) => {
          try {
            flags.applyRemote(raw);
          } catch {
            // fail-open: a bad snapshot can only leave the previous values.
          }
        });
        // `start()` reads the attribute once (synchronous) and then observes it,
        // so a snapshot already written by ISOLATED is applied right here —
        // before the modules below init against the flags.
        adapter.start();
      } catch {
        // fail-open
      }
    };

    // --- Step 1 + 2: safe defaults, then apply any existing snapshot. ---
    bootAdapter();

    // --- Step 3: register and init the modules against the live flags. ---
    registry.register(createPlayerHookModule(win, flags, logger, prunePlayerValue));
    registry.register(createFetchModule(win, flags, logger, pruneAdFields, isAdFieldPresent));
    registry.register(createXhrModule(win, flags, logger, pruneAdFields, isAdFieldPresent));

    // Phase 4–5 runtime modules. Each is self-gated by its own flag as well.
    registry.register(createWatchdogModule(win, flags, logger, selectors));
    registry.register(createObserverModule(win, flags, logger, selectors));
    registry.register(createSpaModule(win, flags, logger, selectors));
    registry.register(createCssModule(win, flags, logger, selectors));

    // Phase 1–3 ad control (skip / fast-forward parity with the retired module).
    registry.register(createAdControlModule(win, flags, logger, selectors));

    const ctx: ModuleContext = { flags, logger, lifecycle, selectors, endpoints };

    // --- Step 4: publish the runtime status the popup reads. ---
    const publisher = createStatusPublisher({
      write: (raw) => {
        try {
          (win.document.documentElement as HTMLElement | null)?.setAttribute(YT_STATUS_ATTRIBUTE, raw);
        } catch {
          // fail-open
        }
      },
      readModules: () => registry.statusAll(),
      readFlags: () => {
        const snapshot = flags.snapshot().flags;
        const out = {} as Record<FlagName, boolean>;
        for (const name of Object.keys(snapshot) as FlagName[]) {
          out[name] = snapshot[name];
        }
        return out;
      },
      readUrl: () => {
        try {
          return win.location?.href ?? '';
        } catch {
          return '';
        }
      },
      now: () => Date.now(),
    });

    // Every flag change re-publishes so the popup reflects the new hook state.
    flags.subscribe(() => publisher.publish());

    void registry.initAll(ctx).finally(() => publisher.publish());

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
        try {
          flags.dispose();
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

/**
 * The JSON-pruner player hook. Installs the `ytInitialPlayerResponse` accessor
 * while `ENABLE_JSON_PRUNER` is on and removes it when off, reacting to a
 * snapshot that lands after boot. `installed` reports the runtime fact (the
 * accessor is in place); `enabled` reports the flag.
 */
function createPlayerHookModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  pruner: (value: unknown) => unknown,
): YouTubeModule {
  const name = 'json-pruner';
  let installed = false;
  let unsubscribe: (() => void) | undefined;
  const target = win as unknown as PlayerHookTarget;

  const apply = (): void => {
    if (flags.get('ENABLE_JSON_PRUNER')) {
      installed = installPlayerResponseHook(target, { flags, logger, pruner });
    } else {
      uninstallPlayerResponseHook(target);
      installed = false;
    }
  };

  return {
    name,
    init(): void {
      apply();
      unsubscribe = flags.subscribe((changed) => {
        if (changed.includes('ENABLE_JSON_PRUNER')) {
          apply();
        }
      });
    },
    dispose(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      uninstallPlayerResponseHook(target);
      installed = false;
    },
    status(): ModuleStatus {
      return {
        name,
        enabled: flags.get('ENABLE_JSON_PRUNER'),
        installed,
        failures: 0,
        lastError: null,
      };
    },
  };
}

/**
 * The fetch hook. Wraps `win.fetch` while `ENABLE_FETCH_HOOK` is on and restores
 * the native function when off. The interceptor additionally re-checks the flag
 * on every request, so an off hook is a pure passthrough even mid-race.
 */
function createFetchModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  pruneAdFields: PruneAdFields,
  isAdFieldPresent: (rawText: string) => boolean,
): YouTubeModule {
  const name = 'fetch-interceptor';
  let installed = false;
  let original: FetchLike | undefined;
  let unsubscribe: (() => void) | undefined;
  const interceptor = createFetchInterceptor({ flags, logger, pruneAdFields, isAdFieldPresent });

  const uninstall = (): void => {
    const target = win as unknown as { fetch?: FetchLike };
    if (original !== undefined) {
      target.fetch = original;
    }
    original = undefined;
    installed = false;
  };

  const apply = (): void => {
    if (!flags.get('ENABLE_FETCH_HOOK')) {
      uninstall();
      return;
    }
    if (original !== undefined) {
      installed = true;
      return;
    }
    const target = win as unknown as { fetch?: FetchLike };
    const nativeFetch = target.fetch;
    if (typeof nativeFetch !== 'function') {
      installed = false;
      return;
    }
    original = nativeFetch;
    // Keep the native `this` (window): the original fetch can be illegal when
    // called unbound.
    const bound: FetchLike = (input, init) => nativeFetch.call(win, input, init);
    target.fetch = interceptor.wrap(bound);
    installed = true;
  };

  return {
    name,
    init(): void {
      apply();
      unsubscribe = flags.subscribe((changed) => {
        if (changed.includes('ENABLE_FETCH_HOOK')) {
          apply();
        }
      });
    },
    dispose(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      uninstall();
    },
    status(): ModuleStatus {
      return {
        name,
        enabled: flags.get('ENABLE_FETCH_HOOK'),
        installed,
        failures: 0,
        lastError: null,
      };
    },
  };
}

/**
 * The XHR hook. Replaces `win.XMLHttpRequest` while `ENABLE_XHR_HOOK` is on and
 * restores the native constructor when off, with the same per-call flag gate as
 * the fetch hook.
 */
function createXhrModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  pruneAdFields: PruneAdFields,
  isAdFieldPresent: (rawText: string) => boolean,
): YouTubeModule {
  const name = 'xhr-interceptor';
  let installed = false;
  let original: XhrConstructor | undefined;
  let unsubscribe: (() => void) | undefined;
  const interceptor = createXhrInterceptor({ flags, logger, pruneAdFields, isAdFieldPresent });

  const uninstall = (): void => {
    const target = win as unknown as { XMLHttpRequest?: XhrConstructor };
    if (original !== undefined) {
      target.XMLHttpRequest = original;
    }
    original = undefined;
    installed = false;
  };

  const apply = (): void => {
    if (!flags.get('ENABLE_XHR_HOOK')) {
      uninstall();
      return;
    }
    if (original !== undefined) {
      installed = true;
      return;
    }
    const target = win as unknown as { XMLHttpRequest?: XhrConstructor };
    const nativeXhr = target.XMLHttpRequest;
    if (typeof nativeXhr !== 'function') {
      installed = false;
      return;
    }
    original = nativeXhr;
    target.XMLHttpRequest = interceptor.wrap(nativeXhr);
    installed = true;
  };

  return {
    name,
    init(): void {
      apply();
      unsubscribe = flags.subscribe((changed) => {
        if (changed.includes('ENABLE_XHR_HOOK')) {
          apply();
        }
      });
    },
    dispose(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      uninstall();
    },
    status(): ModuleStatus {
      return {
        name,
        enabled: flags.get('ENABLE_XHR_HOOK'),
        installed,
        failures: 0,
        lastError: null,
      };
    },
  };
}
