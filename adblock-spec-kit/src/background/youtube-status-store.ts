/**
 * Per-tab YouTube engine runtime-status store (CHECKPOINT FIX-01, Phase C).
 *
 * The worker receives the MAIN engine's status (relayed by the ISOLATED bridge)
 * and keeps the latest record per tab in `chrome.storage.session` — the right
 * area for per-session, per-tab diagnostics: it never syncs, and it is cleared
 * when the browser closes. The popup reads the record for its active tab so it
 * can show the *real* hook state instead of inferring READY from registration.
 *
 * The storage area is injected so the store is unit-testable with a fake and
 * never reaches into `chrome.*` at import time. Everything is fail-open.
 */

import type { YtRuntimeStatus } from '../youtube/state/runtime-status';

/** Key prefix; the tab id is appended (`wgYtStatus:<tabId>`). */
export const YT_STATUS_KEY_PREFIX = 'wgYtStatus:';

export function ytStatusKey(tabId: number): string {
  return `${YT_STATUS_KEY_PREFIX}${tabId}`;
}

/** The subset of a storage area this store needs; injected for tests. */
export interface StatusSessionArea {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

export interface StoredYtStatus {
  readonly status: YtRuntimeStatus;
  readonly receivedAt: number;
}

function isStored(value: unknown): value is StoredYtStatus {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['receivedAt'] === 'number' && typeof record['status'] === 'object';
}

export class YtStatusStore {
  private readonly area: StatusSessionArea;

  constructor(area: StatusSessionArea) {
    this.area = area;
  }

  /** Records the latest status for a tab. Never throws. */
  async save(tabId: number, status: YtRuntimeStatus, receivedAt: number): Promise<void> {
    try {
      await this.area.set({ [ytStatusKey(tabId)]: { status, receivedAt } });
    } catch {
      // fail-open: a session-storage fault must not disturb the worker.
    }
  }

  /** The latest status for a tab, or `undefined` when none/too old. */
  async read(tabId: number): Promise<StoredYtStatus | undefined> {
    try {
      const all = await this.area.get(ytStatusKey(tabId));
      const value = all[ytStatusKey(tabId)];
      return isStored(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  /** Drops a tab's status (e.g. when the tab closes). Never throws. */
  async clear(tabId: number): Promise<void> {
    try {
      await this.area.remove(ytStatusKey(tabId));
    } catch {
      // fail-open: a session-storage fault must not disturb the worker.
    }
  }
}

/** Builds the store backed by the real session storage. */
export function createYtStatusStore(): YtStatusStore {
  return new YtStatusStore(chrome.storage.session);
}
