/**
 * YouTube module master switch — T060 (US-15 / AC-15.1, algorithm.md §Q).
 *
 * The module is an *isolated, best-effort extra* (Constitution VI): it is off
 * unless the user opts in, and a fault in it must never touch the core blocking
 * path. Its single source of truth is the `youtubeModule` flag in
 * `chrome.storage` (never a module variable — Constitution 14), read fresh on
 * demand so the worker can be stopped at any time.
 *
 * Mirrors `security/fingerprint-settings.ts`: the popup/options pages publish
 * *desired state* here and the worker reads it when it decides whether to wire
 * any YouTube layer on a navigation. Storage is injected so tests can pass a
 * fake; `createYouTubeModuleSettings` wires the real `chrome.storage`.
 */

import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';

export class YouTubeModuleSettings {
  private readonly storage: TypedStorage;

  constructor(storage: TypedStorage) {
    this.storage = storage;
  }

  /** Whether the module is on; `false` (the default) means it never runs. */
  async isEnabled(): Promise<boolean> {
    return (await this.storage.get('youtubeModule')) ?? false;
  }

  /** Publishes the module choice (the options/popup switch). */
  async setEnabled(enabled: boolean): Promise<void> {
    await this.storage.set('youtubeModule', enabled);
    logger.info(`youtube module ${enabled ? 'enabled' : 'disabled'}`);
  }
}

/** Builds the manager backed by the real `chrome.storage`. */
export function createYouTubeModuleSettings(): YouTubeModuleSettings {
  return new YouTubeModuleSettings(new TypedStorage());
}
