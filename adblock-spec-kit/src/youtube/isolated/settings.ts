/**
 * Per-layer desired state for the rebuilt engine (Phase 6 — T016a).
 *
 * The popup writes the user's choice for the six user-facing layers here, and
 * the ISOLATED side reads it back before it activates anything (FR-014/FR-015).
 * The three MAIN-world flags are stored the same way, but they cannot take
 * effect until the flag adapter lands (T004) — storing them is still useful so
 * the choice survives a reload and can be reconciled later.
 *
 * Everything lives in the extension's sync storage under one key. The storage
 * area is injected so the module is unit-testable with a fake and never reaches
 * into a global at import time. A missing or malformed value means "use the A-3
 * default", which is ON, so a broken store can only ever *reduce* protection
 * through an explicit choice — never silently disable the engine.
 */

import { DEFAULT_FLAGS, type FlagName } from '../config/flags';

/** The subset of a storage area this module needs; injected for tests. */
export interface SyncArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** The single sync-storage key holding every engine layer choice. */
export const ENGINE_FLAGS_KEY = 'youtubeEngineFlags';

export class YouTubeEngineSettings {
  private readonly area: SyncArea;

  constructor(area: SyncArea) {
    this.area = area;
  }

  /** Desired value of one layer; absent or malformed falls back to the default. */
  async desired(flag: FlagName): Promise<boolean> {
    const stored = await this.readAll();
    const value = stored[flag];
    return typeof value === 'boolean' ? value : DEFAULT_FLAGS[flag];
  }

  /** Every layer's desired value, defaults filled in. */
  async desiredFlags(): Promise<Record<FlagName, boolean>> {
    const stored = await this.readAll();
    const out = { ...DEFAULT_FLAGS };
    for (const name of Object.keys(out) as FlagName[]) {
      const value = stored[name];
      if (typeof value === 'boolean') {
        out[name] = value;
      }
    }
    return out;
  }

  /** Persists one layer choice without disturbing the others. */
  async setFlag(flag: FlagName, enabled: boolean): Promise<void> {
    const stored = await this.readAll();
    stored[flag] = enabled;
    await this.area.set({ [ENGINE_FLAGS_KEY]: stored });
  }

  /**
   * Reads the stored map. A failed read, a missing key or a non-object value
   * all resolve to `{}`, so the caller keeps the safe defaults.
   */
  private async readAll(): Promise<Record<string, unknown>> {
    try {
      const all = await this.area.get(ENGINE_FLAGS_KEY);
      const value = all[ENGINE_FLAGS_KEY];
      return typeof value === 'object' && value !== null
        ? { ...(value as Record<string, unknown>) }
        : {};
    } catch {
      return {};
    }
  }
}

/** Builds the store backed by the real sync storage. */
export function createYouTubeEngineSettings(): YouTubeEngineSettings {
  return new YouTubeEngineSettings(chrome.storage.sync);
}
