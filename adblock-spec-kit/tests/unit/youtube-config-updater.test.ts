import { describe, expect, it, vi } from 'vitest';

import {
  YOUTUBE_CONFIG_MAX_BYTES,
  YouTubeConfigUpdater,
  type YouTubeConfigUpdaterDeps,
} from '../../src/background/youtube-config-updater';
import { TypedStorage } from '../../src/shared/storage';
import type { YouTubeConfig } from '../../src/shared/youtube-config';

/**
 * Q6 update & kill-switch logic (algorithm.md §Q6): a strictly-newer, schema-valid
 * download is stored atomically; a stale, corrupt or oversized one is refused and
 * the previous config survives; `enabled:false` additionally trips the network
 * kill-switch. Storage is a fake so the atomic single-key write is observable.
 */
function makeConfig(overrides: Partial<YouTubeConfig> = {}): YouTubeConfig {
  return {
    version: 1,
    enabled: true,
    layers: { network: true, prune: true, cosmetic: true, skip: true, health: true },
    adFields: ['adPlacements'],
    endpoints: ['/pagead/'],
    selectors: ['.ytp-ad-module'],
    skipSelectors: ['.ytp-ad-skip-button'],
    ...overrides,
  };
}

interface Harness {
  readonly updater: YouTubeConfigUpdater;
  readonly storage: TypedStorage;
  readonly setSpy: ReturnType<typeof vi.fn>;
  readonly killRuleset: ReturnType<typeof vi.fn>;
  stored(key: string): unknown;
}

/** Builds an updater whose storage records every key written. */
function makeUpdater(options: {
  download: string | Error;
  current?: YouTubeConfig | undefined;
}): Harness {
  const store = new Map<string, unknown>();
  const setSpy = vi.fn(async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) {
      store.set(key, value);
    }
  });
  const area = {
    get: async (key: string): Promise<Record<string, unknown>> =>
      store.has(key) ? { [key]: store.get(key) } : {},
    set: setSpy,
    remove: async (key: string): Promise<void> => {
      store.delete(key);
    },
  } as unknown as chrome.storage.StorageArea;
  const storage = new TypedStorage(area);
  const killRuleset = vi.fn(async () => {});
  const deps: YouTubeConfigUpdaterDeps = {
    storage,
    fetchText: async () => {
      if (options.download instanceof Error) {
        throw options.download;
      }
      return options.download;
    },
    current: async () => options.current,
    killRuleset,
  };
  return {
    updater: new YouTubeConfigUpdater(deps),
    storage,
    setSpy,
    killRuleset,
    stored: (key) => store.get(key),
  };
}

describe('YouTubeConfigUpdater.updateNow', () => {
  it('applies a newer valid config atomically under one key', async () => {
    const next = makeConfig({ version: 5 });
    const { updater, setSpy, killRuleset, stored } = makeUpdater({
      download: JSON.stringify(next),
      current: makeConfig({ version: 4 }),
    });

    const result = await updater.updateNow();

    expect(result).toEqual({ ok: true, applied: true, version: 5 });
    expect(stored('youtubeConfigActive')).toEqual(next);
    // Single-key write: the active config flips atomically, never half-set.
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(killRuleset).not.toHaveBeenCalled();
  });

  it('applies when there is no current config yet', async () => {
    const next = makeConfig({ version: 2 });
    const { updater, stored } = makeUpdater({ download: JSON.stringify(next), current: undefined });

    const result = await updater.updateNow();

    expect(result).toEqual({ ok: true, applied: true, version: 2 });
    expect(stored('youtubeConfigActive')).toEqual(next);
  });

  it('ignores a config with the same version (not stale-newer)', async () => {
    const current = makeConfig({ version: 4 });
    const { updater, setSpy, stored } = makeUpdater({
      download: JSON.stringify(makeConfig({ version: 4 })),
      current,
    });

    const result = await updater.updateNow();

    expect(result).toEqual({ ok: true, applied: false, reason: 'stale' });
    expect(setSpy).not.toHaveBeenCalled();
    expect(stored('youtubeConfigActive')).toBeUndefined();
  });

  it('refuses a rolled-back (older) config', async () => {
    const current = makeConfig({ version: 9 });
    const { updater, setSpy, stored } = makeUpdater({
      download: JSON.stringify(makeConfig({ version: 3 })),
      current,
    });

    const result = await updater.updateNow();

    expect(result).toEqual({ ok: true, applied: false, reason: 'stale' });
    expect(setSpy).not.toHaveBeenCalled();
    expect(stored('youtubeConfigActive')).toBeUndefined();
  });

  it('trips the kill-switch when a newer config is disabled', async () => {
    const next = makeConfig({ version: 6, enabled: false });
    const { updater, killRuleset, stored } = makeUpdater({
      download: JSON.stringify(next),
      current: makeConfig({ version: 5 }),
    });

    const result = await updater.updateNow();

    expect(result).toEqual({ ok: true, applied: true, version: 6 });
    expect(stored('youtubeConfigActive')).toEqual(next);
    expect(killRuleset).toHaveBeenCalledTimes(1);
  });

  it('rejects corrupt JSON and keeps the previous config', async () => {
    const { updater, setSpy, stored } = makeUpdater({
      download: '{ not json',
      current: makeConfig({ version: 5 }),
    });

    const result = await updater.updateNow();

    expect(result).toEqual({ ok: false, applied: false, reason: 'corrupt' });
    expect(setSpy).not.toHaveBeenCalled();
    expect(stored('youtubeConfigActive')).toBeUndefined();
  });

  it('rejects a schema-invalid document', async () => {
    const { updater, setSpy } = makeUpdater({
      download: JSON.stringify({ version: 'nope' }),
      current: makeConfig({ version: 5 }),
    });

    const result = await updater.updateNow();

    expect(result).toEqual({ ok: false, applied: false, reason: 'corrupt' });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized download', async () => {
    const padding = 'x'.repeat(YOUTUBE_CONFIG_MAX_BYTES + 1);
    const { updater, setSpy } = makeUpdater({
      download: JSON.stringify(makeConfig({ version: 9, adFields: [padding] })),
      current: makeConfig({ version: 5 }),
    });

    const result = await updater.updateNow();

    expect(result).toEqual({ ok: false, applied: false, reason: 'too-large' });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('reports a network failure without touching stored state', async () => {
    const { updater, setSpy, killRuleset } = makeUpdater({
      download: new Error('offline'),
      current: makeConfig({ version: 5 }),
    });

    const result = await updater.updateNow();

    expect(result).toEqual({ ok: false, applied: false, reason: 'network' });
    expect(setSpy).not.toHaveBeenCalled();
    expect(killRuleset).not.toHaveBeenCalled();
  });
});
