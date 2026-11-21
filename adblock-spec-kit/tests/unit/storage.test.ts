import { describe, expect, it } from 'vitest';

import { TypedStorage } from '../../src/shared/storage';

/** Minimal in-memory stand-in for a chrome.storage area. */
function createFakeArea(): chrome.storage.StorageArea {
  const store = new Map<string, unknown>();

  const area = {
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
  };

  return area as unknown as chrome.storage.StorageArea;
}

describe('TypedStorage', () => {
  it('returns undefined for a missing key', async () => {
    const storage = new TypedStorage(createFakeArea());

    await expect(storage.get('enabled')).resolves.toBeUndefined();
  });

  it('round-trips a value', async () => {
    const storage = new TypedStorage(createFakeArea());

    await storage.set('enabled', true);

    await expect(storage.get('enabled')).resolves.toBe(true);
  });

  it('removes a value', async () => {
    const storage = new TypedStorage(createFakeArea());

    await storage.set('enabled', true);
    await storage.remove('enabled');

    await expect(storage.get('enabled')).resolves.toBeUndefined();
  });
});
