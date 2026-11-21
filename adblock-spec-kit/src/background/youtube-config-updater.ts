/**
 * Q6 — update & kill-switch by data (T067, algorithm.md §Q6).
 *
 * The module's volatile parts are data (Constitution 26), so a YouTube change is
 * fixed by shipping new JSON, never new code. This updater downloads that JSON
 * on the filter-updater's daily cadence, validates it with `isYouTubeConfig`
 * (schema + size, Constitution 9) and replaces the stored "active" config
 * **atomically** — but only when the downloaded `version` is strictly newer, so
 * a rolled-back or stale file can never overwrite a good one (Q6).
 *
 * `enabled:false` in the config is the remote kill-switch: it turns the whole
 * module off for every user after the next successful update, and this updater
 * also disables the module's network ruleset so the network layer stops too.
 * No code is ever downloaded or evaluated — only a validated JSON document.
 */

import { YOUTUBE_RULESET_ID } from '../shared/constants';
import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';
import { isYouTubeConfig, type YouTubeConfig } from '../shared/youtube-config';
import { byteLength } from './filter-updater';
import { loadEffectiveYouTubeConfig } from './youtube-module';

/** Largest config we accept; a truncated/oversized download is rejected. */
export const YOUTUBE_CONFIG_MAX_BYTES = 256 * 1024;
/** Download timeout (mirrors the filter updater). */
export const YOUTUBE_CONFIG_TIMEOUT_MS = 15_000;
/**
 * Where the updatable config is published.
 *
 * TODO(verify): point at the real distribution URL before release (T069); the
 * repository's own published copy is used as the default.
 */
export const YOUTUBE_CONFIG_URL =
  'https://raw.githubusercontent.com/walevmn001/Wale-BrowserGuard/main/adblock-spec-kit/data/youtube-config.json';

/** Why a downloaded config was not applied. */
export type YouTubeConfigRejection = 'network' | 'too-large' | 'corrupt' | 'stale';

export interface YouTubeConfigUpdateResult {
  /** The download was a schema-valid config (a stale one is still `ok`). */
  readonly ok: boolean;
  /** A strictly-newer config was stored. */
  readonly applied: boolean;
  /** The applied version, when `applied`. */
  readonly version?: number;
  readonly reason?: YouTubeConfigRejection;
}

export interface YouTubeConfigUpdaterDeps {
  readonly storage: TypedStorage;
  readonly fetchText: (url: string) => Promise<string>;
  /** The config currently in effect (updated or packaged), for the version gate. */
  readonly current: () => Promise<YouTubeConfig | undefined>;
  /** The kill-switch: turns the module's network ruleset off. */
  readonly killRuleset: () => Promise<void>;
}

type Parsed = { readonly ok: true; readonly config: YouTubeConfig } | {
  readonly ok: false;
  readonly reason: 'too-large' | 'corrupt';
};

export class YouTubeConfigUpdater {
  private readonly deps: YouTubeConfigUpdaterDeps;
  private readonly url: string;

  constructor(deps: YouTubeConfigUpdaterDeps, url: string = YOUTUBE_CONFIG_URL) {
    this.deps = deps;
    this.url = url;
  }

  /** Runs one update attempt; a stale download is a no-op, never a failure. */
  async updateNow(): Promise<YouTubeConfigUpdateResult> {
    let text: string;
    try {
      text = await this.deps.fetchText(this.url);
    } catch (error) {
      logger.warn('youtube config: download failed', error);
      return { ok: false, applied: false, reason: 'network' };
    }

    const parsed = parseConfig(text);
    if (!parsed.ok) {
      return { ok: false, applied: false, reason: parsed.reason };
    }
    const { config } = parsed;

    const current = await this.deps.current();
    if (current !== undefined && config.version <= current.version) {
      return { ok: true, applied: false, reason: 'stale' };
    }

    // Single-key write: the active config flips atomically, never half-set (Q6).
    await this.deps.storage.set('youtubeConfigActive', config);
    if (!config.enabled) {
      await this.deps.killRuleset();
    }
    logger.info(`youtube config: applied v${config.version} (enabled: ${config.enabled})`);
    return { ok: true, applied: true, version: config.version };
  }
}

/** Size-checks and schema-validates a downloaded document. */
function parseConfig(text: string): Parsed {
  if (byteLength(text) > YOUTUBE_CONFIG_MAX_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  return isYouTubeConfig(raw) ? { ok: true, config: raw } : { ok: false, reason: 'corrupt' };
}

async function fetchTextWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YOUTUBE_CONFIG_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function disableYouTubeRuleset(): Promise<void> {
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    disableRulesetIds: [YOUTUBE_RULESET_ID],
  });
}

/** Builds an updater backed by the real `chrome.*` APIs (used by the worker). */
export function createYouTubeConfigUpdater(): YouTubeConfigUpdater {
  return new YouTubeConfigUpdater({
    storage: new TypedStorage(),
    fetchText: fetchTextWithTimeout,
    current: () => loadEffectiveYouTubeConfig(new TypedStorage()),
    killRuleset: disableYouTubeRuleset,
  });
}
