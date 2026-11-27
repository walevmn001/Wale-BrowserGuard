import { describe, expect, it } from 'vitest';

import {
  YT_STATUS_KEY_PREFIX,
  YtStatusStore,
  ytStatusKey,
  type StatusSessionArea,
} from '../../src/background/youtube-status-store';
import { YT_STATUS_SCHEMA_VERSION, type YtRuntimeStatus } from '../../src/youtube/state/runtime-status';

/** In-memory stand-in for `chrome.storage.session`. */
class FakeArea implements StatusSessionArea {
  readonly items = new Map<string, unknown>();
  getFails = false;
  setFails = false;
  removeFails = false;
  removed: string[] = [];

  async get(keys: string): Promise<Record<string, unknown>> {
    if (this.getFails) {
      throw new Error('get failed');
    }
    const value = this.items.get(keys);
    return value === undefined ? {} : { [keys]: value };
  }

  async set(items: Record<string, unknown>): Promise<void> {
    if (this.setFails) {
      throw new Error('set failed');
    }
    for (const [key, value] of Object.entries(items)) {
      this.items.set(key, value);
    }
  }

  async remove(keys: string): Promise<void> {
    if (this.removeFails) {
      throw new Error('remove failed');
    }
    this.removed.push(keys);
    this.items.delete(keys);
  }
}

function status(): YtRuntimeStatus {
  return {
    schemaVersion: YT_STATUS_SCHEMA_VERSION,
    at: 1,
    url: 'https://www.youtube.com/',
    flags: {} as YtRuntimeStatus['flags'],
    modules: {},
  };
}

describe('ytStatusKey', () => {
  it('prefixes the tab id', () => {
    expect(ytStatusKey(7)).toBe(`${YT_STATUS_KEY_PREFIX}7`);
  });
});

describe('YtStatusStore', () => {
  it('round-trips a saved status for its tab', async () => {
    const area = new FakeArea();
    const store = new YtStatusStore(area);
    await store.save(7, status(), 999);
    const stored = await store.read(7);
    expect(stored).toEqual({ status: status(), receivedAt: 999 });
  });

  it('returns undefined when the tab has no record', async () => {
    const store = new YtStatusStore(new FakeArea());
    expect(await store.read(7)).toBeUndefined();
  });

  it('returns undefined for a malformed stored value', async () => {
    const area = new FakeArea();
    area.items.set(ytStatusKey(7), { nope: true });
    const store = new YtStatusStore(area);
    expect(await store.read(7)).toBeUndefined();
  });

  it('is fail-open when get/set throw', async () => {
    const area = new FakeArea();
    const store = new YtStatusStore(area);
    area.setFails = true;
    await expect(store.save(7, status(), 1)).resolves.toBeUndefined();
    area.getFails = true;
    await expect(store.read(7)).resolves.toBeUndefined();
  });

  it('clear removes the tab key and is fail-open', async () => {
    const area = new FakeArea();
    const store = new YtStatusStore(area);
    await store.save(7, status(), 1);
    await store.clear(7);
    expect(area.removed).toContain(ytStatusKey(7));
    expect(await store.read(7)).toBeUndefined();

    area.removeFails = true;
    await expect(store.clear(8)).resolves.toBeUndefined();
  });
});
