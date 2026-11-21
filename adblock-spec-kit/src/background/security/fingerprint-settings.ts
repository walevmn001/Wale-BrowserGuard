/**
 * Anti-fingerprinting settings — T036 (spec AC-6.5, algorithm.md §G).
 *
 * The single source of truth for the opt-in flag plus the per-host off list.
 * Both live in `chrome.storage` (never a module variable — Constitution 14) and
 * are read fresh on demand, so the worker can be stopped at any time.
 *
 * Mirrors `security/privacy-settings.ts`: the popup/options pages only publish
 * *desired state* here, and the worker reads it when it decides whether to
 * inject the MAIN-world reducer on a navigation. Every dependency is injected
 * for unit tests; `createFingerprintSettings` wires the real storage.
 */

import {
  antiFingerprintApplies,
  type AntiFingerprintSettings,
} from '../../content/anti-fingerprint';
import { logger } from '../../shared/logger';
import { TypedStorage } from '../../shared/storage';

export class FingerprintSettings {
  private readonly storage: TypedStorage;

  constructor(storage: TypedStorage) {
    this.storage = storage;
  }

  /** The current choice plus the off list, with defaults filled in. */
  async settings(): Promise<AntiFingerprintSettings> {
    const enabled = (await this.storage.get('antiFingerprint')) ?? false;
    const offSites = (await this.storage.get('antiFingerprintOffSites')) ?? [];
    return { enabled, offSites };
  }

  /** Global opt-in; `false` (the default) means the protection never runs. */
  async isEnabled(): Promise<boolean> {
    return (await this.settings()).enabled;
  }

  /** Publishes the global choice (the options page checkbox). */
  async setEnabled(enabled: boolean): Promise<void> {
    await this.storage.set('antiFingerprint', enabled);
    logger.info(`anti-fingerprinting ${enabled ? 'enabled' : 'disabled'}`);
  }

  /** Hosts where the protection is switched off. */
  async offSites(): Promise<readonly string[]> {
    return (await this.storage.get('antiFingerprintOffSites')) ?? [];
  }

  /** The per-page switch: whether the protection is on for `host`. */
  async isSiteEnabled(host: string): Promise<boolean> {
    return !(await this.offSites()).includes(host);
  }

  /**
   * Turns the protection on/off for one host (the popup's quick switch).
   * Idempotent: setting the same value leaves the list untouched.
   */
  async setSiteEnabled(host: string, enabled: boolean): Promise<readonly string[]> {
    const current = await this.offSites();
    if (enabled === !current.includes(host)) {
      return current;
    }

    const next = enabled ? current.filter((item) => item !== host) : [...current, host];
    await this.storage.set('antiFingerprintOffSites', [...next]);
    logger.info(`anti-fingerprinting ${enabled ? 'on' : 'off'} for ${host}`);
    return next;
  }

  /** Whether the worker should inject the reducer for `host` (AC-6.5). */
  async appliesTo(host: string): Promise<boolean> {
    return antiFingerprintApplies(await this.settings(), host);
  }
}

/** Builds the manager backed by the real `chrome.storage`. */
export function createFingerprintSettings(): FingerprintSettings {
  return new FingerprintSettings(new TypedStorage());
}
