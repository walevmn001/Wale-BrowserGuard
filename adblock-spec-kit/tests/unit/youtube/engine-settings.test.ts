import { describe, expect, it } from 'vitest';

import { DEFAULT_FLAGS, FLAG_NAMES, type FlagName } from '../../../src/youtube/config/flags';
import {
  ENGINE_FLAGS_KEY,
  YouTubeEngineSettings,
  type SyncArea,
} from '../../../src/youtube/isolated/settings';

/** In-memory stand-in for `chrome.storage.sync`. */
class FakeSyncArea implements SyncArea {
  readonly store = new Map<string, unknown>();
  failNextGet = false;

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (this.failNextGet) {
      this.failNextGet = false;
      throw new Error('storage read failed');
    }
    const out: Record<string, unknown> = {};
    if (typeof keys === 'string') {
      if (this.store.has(keys)) out[keys] = this.store.get(keys);
    } else {
      for (const [key, value] of this.store) out[key] = value;
    }
    return out;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) this.store.set(key, value);
  }
}

function settings(area: FakeSyncArea): YouTubeEngineSettings {
  return new YouTubeEngineSettings(area);
}

describe('YouTubeEngineSettings — defaults', () => {
  it('returns the A-3 default (ON for every flag) from an empty store', async () => {
    const store = settings(new FakeSyncArea());
    for (const name of FLAG_NAMES) {
      expect(await store.desired(name)).toBe(DEFAULT_FLAGS[name]);
      expect(await store.desired(name)).toBe(true);
    }
  });

  it('desiredFlags fills every flag with its default', async () => {
    const flags = await settings(new FakeSyncArea()).desiredFlags();
    expect(Object.keys(flags).sort()).toEqual([...FLAG_NAMES].sort());
    for (const name of FLAG_NAMES) expect(flags[name]).toBe(true);
  });

  it('ignores malformed stored values and keeps the default', async () => {
    const area = new FakeSyncArea();
    area.store.set(ENGINE_FLAGS_KEY, { ENABLE_DNR: 'nope', ENABLE_CSS_HIDER: 3 });
    const store = settings(area);
    expect(await store.desired('ENABLE_DNR')).toBe(true);
    expect(await store.desired('ENABLE_CSS_HIDER')).toBe(true);
  });

  it('falls back to defaults when the whole stored value is not an object', async () => {
    const area = new FakeSyncArea();
    area.store.set(ENGINE_FLAGS_KEY, 42);
    expect(await settings(area).desired('ENABLE_JSON_PRUNER')).toBe(true);
  });

  it('falls back to defaults when reading the store throws', async () => {
    const area = new FakeSyncArea();
    area.failNextGet = true;
    expect(await settings(area).desired('ENABLE_FETCH_HOOK')).toBe(true);
  });
});

describe('YouTubeEngineSettings — persisted choices', () => {
  it('reads back a stored boolean for the requested flag', async () => {
    const area = new FakeSyncArea();
    area.store.set(ENGINE_FLAGS_KEY, { ENABLE_DNR: false });
    const store = settings(area);
    expect(await store.desired('ENABLE_DNR')).toBe(false);
    expect(await store.desired('ENABLE_XHR_HOOK')).toBe(true);
  });

  it('setFlag persists one choice without disturbing the others', async () => {
    const area = new FakeSyncArea();
    const store = settings(area);

    await store.setFlag('ENABLE_DNR', false);
    await store.setFlag('ENABLE_JSON_PRUNER', false);

    expect(await store.desired('ENABLE_DNR')).toBe(false);
    expect(await store.desired('ENABLE_JSON_PRUNER')).toBe(false);
    expect(await store.desired('ENABLE_RUNTIME_GUARD')).toBe(true);

    const persisted = area.store.get(ENGINE_FLAGS_KEY) as Record<string, unknown>;
    expect(persisted.ENABLE_DNR).toBe(false);
    expect(persisted.ENABLE_JSON_PRUNER).toBe(false);
  });

  it('setFlag writes under the single engine key', async () => {
    const area = new FakeSyncArea();
    await settings(area).setFlag('ENABLE_CSS_HIDER', false);
    expect(area.store.has(ENGINE_FLAGS_KEY)).toBe(true);
    expect(area.store.size).toBe(1);
  });
});

describe('YouTubeEngineSettings — flag name coverage', () => {
  it('desiredFlags round-trips every flag name', async () => {
    const area = new FakeSyncArea();
    const store = settings(area);
    for (const name of FLAG_NAMES) {
      await store.setFlag(name, false);
    }
    const flags = await store.desiredFlags();
    for (const name of FLAG_NAMES as readonly FlagName[]) {
      expect(flags[name]).toBe(false);
    }
  });
});
