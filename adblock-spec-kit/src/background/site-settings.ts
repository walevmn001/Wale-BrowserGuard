/**
 * Per-site preferences and local hidden selectors (Phase 3, Phase 9 §3–4).
 *
 * Two small, related stores kept together because they are keyed the same way
 * (by host) and both feed the cosmetic injector:
 *  - `siteSettings`: per-host overrides (today: cosmetic filtering off).
 *  - `hiddenSelectors`: selectors the element picker saved for a host.
 *
 * Both live in `chrome.storage` and survive restarts (Constitution 14).
 */

import { logger } from '../shared/logger';
import { MAX_SELECTOR_LENGTH } from '../shared/selector';
import { TypedStorage } from '../shared/storage';
import type { SiteSetting } from '../shared/types';

export { MAX_SELECTOR_LENGTH };

export interface SitePreferencesDeps {
  readonly storage: TypedStorage;
}

export class SitePreferences {
  private readonly deps: SitePreferencesDeps;

  constructor(deps: SitePreferencesDeps) {
    this.deps = deps;
  }

  async all(): Promise<Record<string, SiteSetting>> {
    return { ...(await this.deps.storage.get('siteSettings')) };
  }

  async get(host: string): Promise<SiteSetting> {
    return (await this.all())[host] ?? {};
  }

  /** Merges a patch into the host's settings; removing the last key drops the host. */
  async patch(host: string, patch: SiteSetting): Promise<void> {
    const settings = await this.all();
    const merged: SiteSetting = { ...settings[host], ...patch };
    if (merged.cosmeticOff === undefined || merged.cosmeticOff === false) {
      delete settings[host];
    } else {
      settings[host] = merged;
    }
    await this.deps.storage.set('siteSettings', settings);
  }

  async hidden(host: string): Promise<readonly string[]> {
    return (await this.deps.storage.get('hiddenSelectors'))?.[host] ?? [];
  }

  /** Adds a selector for the host (trimmed, length-capped, de-duplicated). */
  async addHidden(host: string, selector: string): Promise<boolean> {
    const clean = selector.trim().slice(0, MAX_SELECTOR_LENGTH);
    if (clean === '') {
      return false;
    }
    const all = { ...(await this.deps.storage.get('hiddenSelectors')) };
    const current = all[host] ?? [];
    if (current.includes(clean)) {
      return false;
    }
    all[host] = [...current, clean];
    await this.deps.storage.set('hiddenSelectors', all);
    logger.info(`element hidden on ${host}`);
    return true;
  }

  async removeHidden(host: string, selector: string): Promise<void> {
    const all = { ...(await this.deps.storage.get('hiddenSelectors')) };
    const next = (all[host] ?? []).filter((item) => item !== selector);
    if (next.length === 0) {
      delete all[host];
    } else {
      all[host] = next;
    }
    await this.deps.storage.set('hiddenSelectors', all);
  }
}

/** Builds a store backed by real storage. */
export function createSitePreferences(): SitePreferences {
  return new SitePreferences({ storage: new TypedStorage() });
}
