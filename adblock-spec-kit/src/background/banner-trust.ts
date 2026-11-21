/**
 * Hosts the user told the in-page security banner to trust (Phase 7).
 *
 * When the banner is dismissed with "trust this site", the host is recorded
 * here and the worker stops injecting the banner there. Stored in
 * `chrome.storage` so it survives restarts (Constitution 14); it never leaves
 * the machine.
 */

import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';

export interface BannerTrustDeps {
  readonly storage: TypedStorage;
}

export class BannerTrust {
  private readonly deps: BannerTrustDeps;

  constructor(deps: BannerTrustDeps) {
    this.deps = deps;
  }

  /** Trusted hosts, empty until the user trusts one. */
  async list(): Promise<readonly string[]> {
    return (await this.deps.storage.get('bannerTrusted')) ?? [];
  }

  async has(host: string): Promise<boolean> {
    return (await this.list()).includes(host);
  }

  /** Idempotent: trusting the same host twice keeps a single entry. */
  async trust(host: string): Promise<boolean> {
    const clean = host.trim().toLowerCase();
    if (clean === '') {
      return false;
    }
    const current = await this.list();
    if (current.includes(clean)) {
      return false;
    }
    await this.deps.storage.set('bannerTrusted', [...current, clean]);
    logger.info(`security banner trusted on ${clean}`);
    return true;
  }
}

/** Builds a store backed by real storage. */
export function createBannerTrust(): BannerTrust {
  return new BannerTrust({ storage: new TypedStorage() });
}
