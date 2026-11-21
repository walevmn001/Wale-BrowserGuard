import { describe, expect, it } from 'vitest';

import { FingerprintSettings } from '../../src/background/security/fingerprint-settings';
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

function createSettings(): FingerprintSettings {
  return new FingerprintSettings(new TypedStorage(createFakeArea()));
}

describe('FingerprintSettings', () => {
  it('is off by default with no site switched off (AC-6.5)', async () => {
    const settings = createSettings();

    await expect(settings.isEnabled()).resolves.toBe(false);
    await expect(settings.offSites()).resolves.toEqual([]);
    await expect(settings.appliesTo('example.org')).resolves.toBe(false);
  });

  it('setEnabled persists the global opt-in', async () => {
    const settings = createSettings();

    await settings.setEnabled(true);

    await expect(settings.isEnabled()).resolves.toBe(true);
    await expect(settings.appliesTo('example.org')).resolves.toBe(true);
  });

  it('setSiteEnabled toggles the per-page off list, idempotently', async () => {
    const settings = createSettings();
    await settings.setEnabled(true);

    await settings.setSiteEnabled('example.org', false);
    await settings.setSiteEnabled('example.org', false); // no duplicate
    await expect(settings.offSites()).resolves.toEqual(['example.org']);
    await expect(settings.isSiteEnabled('example.org')).resolves.toBe(false);
    await expect(settings.appliesTo('example.org')).resolves.toBe(false);

    await settings.setSiteEnabled('example.org', true);
    await expect(settings.offSites()).resolves.toEqual([]);
    await expect(settings.appliesTo('example.org')).resolves.toBe(true);
  });

  it('applies per host: an off site does not disable the others', async () => {
    const settings = createSettings();
    await settings.setEnabled(true);
    await settings.setSiteEnabled('broken.example', false);

    await expect(settings.appliesTo('broken.example')).resolves.toBe(false);
    await expect(settings.appliesTo('fine.example')).resolves.toBe(true);
  });
});
