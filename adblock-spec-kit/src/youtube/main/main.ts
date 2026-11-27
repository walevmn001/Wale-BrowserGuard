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
 * FIX-01 boot order. The engine used to init every module against the A-3
 * defaults *before* the T004 snapshot arrived, and the hook modules never
 * reconsidered. Boot now follows the mandated order:
 *   1. build the flags in the safe default state;
 *   2. start the dataset adapter so it can receive and validate the snapshot;
 *   3. apply the validated flags (via `applyRemote`);
 *   4. initialise the flag-dependent modules;
 *   5. keep watching flag changes for the whole document lifetime.
 * The hook modules subscribe to the flags themselves, so a deferred snapshot
 * (root not parsed yet) still reconciles them the moment it lands.
 *
 * It is idempotent (a guard on `win`) and absolutely fail-open: the whole boot
 * runs inside a try/catch and never throws into the page. The engine starts on
 * the A-3 default (all ON) until the ISOLATED bridge publishes a snapshot, so a
 * saved "off" takes effect on the live page without a reload.
 */

import { adapterStateOf } from '../adapter/adapter';
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
import {
  ENGINE_STATUS_ATTRIBUTE,
  buildEngineStatus,
  type EngineComponentStatus,
  type MainHookFlagName,
} from '../state/engine-status';
import { createAdControlModule } from './ad-control-module';
import { createFetchInterceptor, type FetchLike } from './fetch-interceptor';
import { createXhrInterceptor, type XhrConstructor } from './xhr-interceptor';
import {
  installPlayerResponseHook,
  type PlayerHookHandle,
  type PlayerHookTarget,
} from './player-response-hook';
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

/** Module name (registry) per MAIN hook flag, so the status writer can find it. */
const HOOK_MODULE_NAMES: Readonly<Record<MainHookFlagName, string>> = {
  ENABLE_JSON_PRUNER: 'json-pruner',
  ENABLE_FETCH_HOOK: 'fetch-interceptor',
  ENABLE_XHR_HOOK: 'xhr-interceptor',
};

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

    // 1. Safe start state: every flag on its A-3 default until a snapshot lands.
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

    // Every module is registered up front; each self-gates on its own flag and
    // reconciles on change, so turning a hook on after boot needs no reload.
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

    // The MAIN → ISOLATED handshake: publish a small runtime status the popup
    // reads back (via the ISOLATED bridge) so it never fakes READY.
    let adapter: DatasetAdapter | undefined;
    let adapterWaiter: MutationObserver | undefined;

    const hookStatus = (flag: MainHookFlagName): EngineComponentStatus => {
      const status = registry.get(HOOK_MODULE_NAMES[flag])?.status();
      return { ready: status?.enabled === true, enabled: flags.get(flag) };
    };

    const writeStatus = (): void => {
      try {
        const root = win.document.documentElement as HTMLElement | null;
        if (root === null) {
          return;
        }
        const adapterStatus = adapter?.status();
        const status = buildEngineStatus({
          adapter: adapterStatus === undefined ? 'WAITING' : adapterStateOf(adapterStatus),
          delivered: adapterStatus?.deliveredCount ?? 0,
          hooks: {
            ENABLE_JSON_PRUNER: hookStatus('ENABLE_JSON_PRUNER'),
            ENABLE_FETCH_HOOK: hookStatus('ENABLE_FETCH_HOOK'),
            ENABLE_XHR_HOOK: hookStatus('ENABLE_XHR_HOOK'),
          },
        });
        root.setAttribute(ENGINE_STATUS_ATTRIBUTE, JSON.stringify(status));
      } catch {
        // fail-open: a status write must never break the page.
      }
    };

    // 5. Watch config changes for the whole document lifetime: the adapter hands
    // raw snapshots in, the flags notify their subscribers, and we re-publish.
    const unsubscribeStatus = flags.subscribe(() => writeStatus());

    // 2. Receive and validate the snapshot before the modules initialise.
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
            // 3. Apply the validated flags; a bad snapshot keeps the defaults.
            flags.applyRemote(raw);
          } catch {
            // fail-open
          }
          writeStatus();
        });
        adapter.start();
        writeStatus();
      } catch {
        // fail-open
      }
    };
    bootAdapter();

    // 4. Initialise the modules against the (now applied) flags.
    void registry.initAll(ctx).then(() => writeStatus());
    writeStatus();

    const handle: EngineHandle = {
      status: () => registry.statusAll(),
      dispose: () => {
        try {
          unsubscribeStatus();
        } catch {
          // fail-open
        }
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
 * JSON-pruner hook module. Installs/uninstalls the `ytInitialPlayerResponse`
 * accessor as the flag flips, and reports "settled" when the installed state
 * matches the flag. The accessor itself re-checks the flag per assignment, so an
 * OFF is honoured even between reconciliations.
 */
function createPlayerHookModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  pruner: (value: unknown) => unknown,
): YouTubeModule {
  const name = HOOK_MODULE_NAMES.ENABLE_JSON_PRUNER;
  let installed = false;
  let handle: PlayerHookHandle | undefined;
  let unsubscribe: (() => void) | undefined;

  const apply = (): void => {
    const on = flags.get('ENABLE_JSON_PRUNER');
    if (on && !installed) {
      handle = installPlayerResponseHook(win as unknown as PlayerHookTarget, { flags, logger, pruner });
      installed = handle !== undefined;
    } else if (!on && installed) {
      handle?.uninstall();
      handle = undefined;
      installed = false;
    }
  };

  return {
    name,
    init(): void {
      unsubscribe = flags.subscribe(apply);
      apply();
    },
    dispose(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      handle?.uninstall();
      handle = undefined;
      installed = false;
    },
    status(): ModuleStatus {
      // "ready" = the page is in the state the current flag asks for.
      return { name, enabled: installed === flags.get('ENABLE_JSON_PRUNER'), failures: 0, lastError: null };
    },
  };
}

/**
 * Fetch-hook module. The wrapper is installed once (so a runtime OFF→ON needs no
 * reinstall) and the interceptor gates every call by the flag, which preserves
 * the original request behaviour exactly when the hook is off.
 */
function createFetchModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  pruneAdFields: PruneAdFields,
  isAdFieldPresent: (rawText: string) => boolean,
): YouTubeModule {
  const name = HOOK_MODULE_NAMES.ENABLE_FETCH_HOOK;
  let installed = false;
  let original: FetchLike | undefined;
  let unsubscribe: (() => void) | undefined;

  return {
    name,
    init(): void {
      const target = win as unknown as { fetch?: FetchLike };
      const nativeFetch = target.fetch;
      if (typeof nativeFetch === 'function') {
        original = nativeFetch;
        const interceptor = createFetchInterceptor({ flags, logger, pruneAdFields, isAdFieldPresent });
        // Keep the native `this` (window): the original fetch can be illegal when
        // called unbound.
        const bound: FetchLike = (input, init) => nativeFetch.call(win, input, init);
        target.fetch = interceptor.wrap(bound);
        installed = true;
      }
      unsubscribe = flags.subscribe(() => undefined);
    },
    dispose(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      const target = win as unknown as { fetch?: FetchLike };
      if (original !== undefined) {
        target.fetch = original;
      }
      original = undefined;
      installed = false;
    },
    status(): ModuleStatus {
      return { name, enabled: installed, failures: 0, lastError: null };
    },
  };
}

/**
 * XHR-hook module. As with fetch, the subclass is installed once and the
 * per-request rewrite is gated by the flag inside the interceptor, so the off
 * state keeps the native XHR behaviour untouched.
 */
function createXhrModule(
  win: Window,
  flags: FeatureFlags,
  logger: DebugLogger,
  pruneAdFields: PruneAdFields,
  isAdFieldPresent: (rawText: string) => boolean,
): YouTubeModule {
  const name = HOOK_MODULE_NAMES.ENABLE_XHR_HOOK;
  let installed = false;
  let original: XhrConstructor | undefined;
  let unsubscribe: (() => void) | undefined;

  return {
    name,
    init(): void {
      const target = win as unknown as { XMLHttpRequest?: XhrConstructor };
      const nativeXhr = target.XMLHttpRequest;
      if (typeof nativeXhr === 'function') {
        original = nativeXhr;
        const interceptor = createXhrInterceptor({ flags, logger, pruneAdFields, isAdFieldPresent });
        target.XMLHttpRequest = interceptor.wrap(nativeXhr);
        installed = true;
      }
      unsubscribe = flags.subscribe(() => undefined);
    },
    dispose(): void {
      unsubscribe?.();
      unsubscribe = undefined;
      const target = win as unknown as { XMLHttpRequest?: XhrConstructor };
      if (original !== undefined) {
        target.XMLHttpRequest = original;
      }
      original = undefined;
      installed = false;
    },
    status(): ModuleStatus {
      return { name, enabled: installed, failures: 0, lastError: null };
    },
  };
}
