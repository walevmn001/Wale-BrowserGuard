import { describe, expect, it } from 'vitest';

import { BannerTrust } from '../../src/background/banner-trust';
import { TypedStorage } from '../../src/shared/storage';

function createFakeArea(): chrome.storage.StorageArea {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string): Promise<Record<string, unknown>> =>
      store.has(key) ? { [key]: store.get(key) } : {},
    set: async (items: Record<string, unknown>): Promise<void> => {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
    },
    remove: async (key: string): Promise<void> => {
      store.delete(key);
    },
  } as unknown as chrome.storage.StorageArea;
}

function createStore(): BannerTrust {
  return new BannerTrust({ storage: new TypedStorage(createFakeArea()) });
}

describe('BannerTrust', () => {
  it('starts empty', async () => {
    const trust = createStore();

    await expect(trust.list()).resolves.toEqual([]);
    await expect(trust.has('example.com')).resolves.toBe(false);
  });

  it('records a trusted host and reports it back', async () => {
    const trust = createStore();

    await expect(trust.trust('example.com')).resolves.toBe(true);

    await expect(trust.list()).resolves.toEqual(['example.com']);
    await expect(trust.has('example.com')).resolves.toBe(true);
  });

  it('normalises the host (lower-cased, trimmed)', async () => {
    const trust = createStore();

    await trust.trust('  Example.COM  ');

    await expect(trust.list()).resolves.toEqual(['example.com']);
    await expect(trust.has('example.com')).resolves.toBe(true);
  });

  it('is idempotent: trusting the same host twice keeps one entry', async () => {
    const trust = createStore();

    await trust.trust('example.com');
    await expect(trust.trust('example.com')).resolves.toBe(false);

    await expect(trust.list()).resolves.toEqual(['example.com']);
  });

  it('ignores an empty host', async () => {
    const trust = createStore();

    await expect(trust.trust('   ')).resolves.toBe(false);
    await expect(trust.list()).resolves.toEqual([]);
  });
});
