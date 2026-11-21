/**
 * YouTube module orchestrator — T063+ (US-15, algorithm.md §Q).
 *
 * The module is an isolated, opt-in, best-effort extra (Constitution VI): it
 * only does anything when the user turned it on (`youtubeModule`, AC-15.1) and
 * the shipped configuration still allows it (`config.enabled`, the Q6
 * kill-switch). Each layer is driven from here, and every step is fail-open so
 * a YouTube change can never affect the core blocking path.
 *
 * T063 wires Q2 (`prune`), T064 wires Q3 (`cosmetic`), T065 wires Q4 (`skip`)
 * and T066 wires Q5 (the health monitor + its session degrade flags).
 *
 * Every dependency is injected so the decision logic is unit-testable;
 * `createYouTubeModule` wires the real settings, config loader and
 * `chrome.scripting`.
 */

import {
  applyCosmetic,
  createCosmeticDataCache,
  isCosmeticData,
  pageHost,
  type CosmeticData,
} from '../content/cosmetic';
import { installYouTubeAdSkip, YOUTUBE_AD_SKIP_OPTIONS } from '../content/youtube/ad-skip';
import { installYouTubeHealth, YOUTUBE_HEALTH_OPTIONS } from '../content/youtube/health';
import { installYouTubePrune, YOUTUBE_PRUNE_LIMITS } from '../content/youtube/prune-main';
import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';
import {
  isYouTubeConfig,
  YOUTUBE_CONFIG_PATH,
  YOUTUBE_COSMETIC_PATH,
  type YouTubeConfig,
} from '../shared/youtube-config';
import {
  createHealthStorage,
  readHealthState,
  type YouTubeHealthState,
} from './youtube-health';
import { createYouTubeModuleSettings } from './youtube-settings';

/** Hosts the module runs on; mirrors the `*://*.youtube.com/*` match pattern. */
export function isYouTubeHost(host: string): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com');
}

/**
 * Which navigation signal drove the run. Q2 needs the earliest one (so the prune
 * hooks are installed before the page reads the player response), while Q3's CSS
 * is inserted only once a stable document exists (`complete`).
 */
export type YouTubePhase = 'loading' | 'complete';

/** What the orchestrator needs; injected so tests can pass fakes. */
export interface YouTubeModuleDeps {
  readonly settings: { isEnabled(): Promise<boolean> };
  /** The effective config (shipped, or the Q6 update), or `undefined` if unusable. */
  readonly loadConfig: () => Promise<YouTubeConfig | undefined>;
  /** Q2 — inject the MAIN-world prune script for one tab. */
  readonly injectPrune: (tabId: number, config: YouTubeConfig) => Promise<void>;
  /** Q3 — hide the ad UI on `url`'s YouTube page (CSS from the shipped data). */
  readonly injectCosmetic: (tabId: number, url: string | undefined) => Promise<void>;
  /** Q4 — watch the player and skip / fast-forward an ad that still plays. */
  readonly injectAdSkip: (tabId: number, config: YouTubeConfig) => Promise<void>;
  /** Q5 — watch the player for playback faults (health monitor). */
  readonly injectHealth: (tabId: number) => Promise<void>;
  /** Q5 — the session degrade flags this navigation must respect. */
  readonly healthState: () => Promise<YouTubeHealthState>;
}

export class YouTubeModule {
  private readonly deps: YouTubeModuleDeps;

  constructor(deps: YouTubeModuleDeps) {
    this.deps = deps;
  }

  /**
   * Runs the enabled layers for a navigation to `url` in `tabId`. Fail-open by
   * contract: the caller wraps it in a guard, and a non-YouTube URL, a disabled
   * module or a disabled config is a silent no-op.
   */
  async handleTab(
    tabId: number,
    url: string | undefined,
    phase: YouTubePhase,
  ): Promise<void> {
    const host = pageHost(url);
    if (host === undefined || !isYouTubeHost(host)) {
      return;
    }
    if (!(await this.deps.settings.isEnabled())) {
      return;
    }
    const config = await this.deps.loadConfig();
    if (config === undefined || !config.enabled) {
      return; // Q6 kill-switch: `enabled:false` disables every layer.
    }
    // Q5: a degrade this session drops layers without touching the config.
    const health = await this.deps.healthState();
    if (health.moduleDisabled) {
      return;
    }
    if (config.layers.prune && !health.q2Disabled) {
      await this.deps.injectPrune(tabId, config);
    }
    // Q3/Q4/Q5 touch the DOM, so they wait for `complete`; the early pass exists
    // only for Q2's hooks (the page may be about to swap documents at `loading`).
    if (phase === 'complete' && config.layers.cosmetic) {
      await this.deps.injectCosmetic(tabId, url);
    }
    if (phase === 'complete' && config.layers.skip) {
      await this.deps.injectAdSkip(tabId, config);
    }
    if (phase === 'complete' && config.layers.health) {
      await this.deps.injectHealth(tabId);
    }
  }
}

/**
 * Reads the packed config from the extension and validates it; a bad or missing
 * file yields `undefined` (the module then does nothing) rather than throwing.
 */
export async function loadPackagedYouTubeConfig(): Promise<YouTubeConfig | undefined> {
  try {
    const response = await fetch(chrome.runtime.getURL(YOUTUBE_CONFIG_PATH));
    const raw: unknown = await response.json();
    return isYouTubeConfig(raw) ? raw : undefined;
  } catch (error) {
    logger.warn('failed to load the YouTube config', error);
    return undefined;
  }
}

/**
 * The config the module actually runs on (Q6). A newer, schema-valid config the
 * updater stored wins over the packaged file — that is how a remote
 * `enabled:false` kill-switch reaches the user. A stored value that no longer
 * validates is ignored (fail-safe) and the packaged file is used instead.
 */
export async function loadEffectiveYouTubeConfig(
  storage: TypedStorage = new TypedStorage(),
): Promise<YouTubeConfig | undefined> {
  const active = await storage.get('youtubeConfigActive');
  if (active !== undefined && isYouTubeConfig(active)) {
    return active;
  }
  return loadPackagedYouTubeConfig();
}

/**
 * Reads the module's element-hiding data (`rules/cosmetic/youtube.json`, T064)
 * and validates it; cached for the worker lifetime because it is immutable build
 * output (like the core cosmetic data), never user state.
 */
const loadYouTubeCosmeticData = createCosmeticDataCache(async (): Promise<CosmeticData> => {
  const response = await fetch(chrome.runtime.getURL(YOUTUBE_COSMETIC_PATH));
  const raw: unknown = await response.json();
  if (!isCosmeticData(raw)) {
    throw new Error('youtube cosmetic data has an unexpected shape');
  }
  return raw;
});

/** Builds the orchestrator backed by the real settings, storage and scripting. */
export function createYouTubeModule(): YouTubeModule {
  return new YouTubeModule({
    settings: createYouTubeModuleSettings(),
    loadConfig: loadEffectiveYouTubeConfig,
    injectPrune: async (tabId, config) => {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: installYouTubePrune,
        args: [config.adFields, YOUTUBE_PRUNE_LIMITS],
        injectImmediately: true,
      });
    },
    injectCosmetic: async (tabId, url) => {
      await applyCosmetic(
        {
          loadData: loadYouTubeCosmeticData,
          insertCss: async (id, css) => {
            await chrome.scripting.insertCSS({ target: { tabId: id }, css });
          },
        },
        tabId,
        url,
      );
    },
    injectAdSkip: async (tabId, config) => {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: installYouTubeAdSkip,
        args: [config.skipSelectors, YOUTUBE_AD_SKIP_OPTIONS],
        injectImmediately: true,
      });
    },
    injectHealth: async (tabId) => {
      // No `world: 'MAIN'`: the monitor runs in the content-script world so it
      // can reach `chrome.runtime.sendMessage` (health.ts).
      await chrome.scripting.executeScript({
        target: { tabId },
        func: installYouTubeHealth,
        args: [YOUTUBE_HEALTH_OPTIONS],
        injectImmediately: true,
      });
    },
    healthState: () => readHealthState(createHealthStorage()),
  });
}
