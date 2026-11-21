/**
 * YouTube module orchestrator — T063+ (US-15, algorithm.md §Q).
 *
 * The module is an isolated, opt-in, best-effort extra (Constitution VI): it
 * only does anything when the user turned it on (`youtubeModule`, AC-15.1) and
 * the shipped configuration still allows it (`config.enabled`, the Q6
 * kill-switch). Each layer is driven from here, and every step is fail-open so
 * a YouTube change can never affect the core blocking path.
 *
 * T063 wires Q2 (`prune`): strip the advertising fields from the player
 * response by injecting a self-contained MAIN-world script. Later tasks add Q3
 * (cosmetic), Q4 (skip) and Q5 (health) to the same `handleTab` decision.
 *
 * Every dependency is injected so the decision logic is unit-testable;
 * `createYouTubeModule` wires the real settings, config loader and
 * `chrome.scripting`.
 */

import { pageHost } from '../content/cosmetic';
import { installYouTubePrune, YOUTUBE_PRUNE_LIMITS } from '../content/youtube/prune-main';
import { logger } from '../shared/logger';
import {
  isYouTubeConfig,
  YOUTUBE_CONFIG_PATH,
  type YouTubeConfig,
} from '../shared/youtube-config';
import { createYouTubeModuleSettings } from './youtube-settings';

/** Hosts the module runs on; mirrors the `*://*.youtube.com/*` match pattern. */
export function isYouTubeHost(host: string): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com');
}

/** What the orchestrator needs; injected so tests can pass fakes. */
export interface YouTubeModuleDeps {
  readonly settings: { isEnabled(): Promise<boolean> };
  /** The effective config (shipped, or the Q6 update), or `undefined` if unusable. */
  readonly loadConfig: () => Promise<YouTubeConfig | undefined>;
  /** Q2 — inject the MAIN-world prune script for one tab. */
  readonly injectPrune: (tabId: number, config: YouTubeConfig) => Promise<void>;
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
  async handleTab(tabId: number, url: string | undefined): Promise<void> {
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
    if (config.layers.prune) {
      await this.deps.injectPrune(tabId, config);
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

/** Builds the orchestrator backed by the real settings, storage and scripting. */
export function createYouTubeModule(): YouTubeModule {
  return new YouTubeModule({
    settings: createYouTubeModuleSettings(),
    loadConfig: loadPackagedYouTubeConfig,
    injectPrune: async (tabId, config) => {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: installYouTubePrune,
        args: [config.adFields, YOUTUBE_PRUNE_LIMITS],
        injectImmediately: true,
      });
    },
  });
}
