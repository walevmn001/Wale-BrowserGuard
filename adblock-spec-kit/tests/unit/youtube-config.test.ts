import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { YouTubeModuleSettings } from '../../src/background/youtube-settings';
import { TypedStorage } from '../../src/shared/storage';
import { isYouTubeConfig, YOUTUBE_CONFIG_MAX } from '../../src/shared/youtube-config';

const CONFIG_PATH = new URL('../../data/youtube-config.json', import.meta.url);
const SHIPPED: unknown = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

/** A fresh clone of the shipped config, so each case mutates its own copy. */
function clone(): Record<string, unknown> {
  return structuredClone(SHIPPED) as Record<string, unknown>;
}

describe('isYouTubeConfig', () => {
  it('accepts the shipped data/youtube-config.json', () => {
    expect(isYouTubeConfig(SHIPPED)).toBe(true);
  });

  it('ships available so the opt-in switch can work (Q6 kill-switch semantics)', () => {
    // `enabled:false` is the *kill-switch* a pushed update may set to disable
    // the module for everyone; the shipped copy must leave it available,
    // otherwise the user's own switch (AC-15.1) could never turn anything on.
    expect((SHIPPED as { enabled: boolean }).enabled).toBe(true);
  });

  it('rejects non-object inputs', () => {
    for (const value of [null, undefined, 'x', 42, [], true]) {
      expect(isYouTubeConfig(value)).toBe(false);
    }
  });

  it('ignores unknown extra keys (forward compatibility)', () => {
    const config = clone();
    config['future'] = { anything: true };
    expect(isYouTubeConfig(config)).toBe(true);
  });

  const cases: ReadonlyArray<readonly [string, (config: Record<string, unknown>) => void]> = [
    ['version is missing', (config) => delete config['version']],
    ['version is 0', (config) => (config['version'] = 0)],
    ['version is negative', (config) => (config['version'] = -1)],
    ['version is not an integer', (config) => (config['version'] = 1.5)],
    ['version exceeds the cap', (config) => (config['version'] = YOUTUBE_CONFIG_MAX.version + 1)],
    ['enabled is missing', (config) => delete config['enabled']],
    ['enabled is not a boolean', (config) => (config['enabled'] = 'yes')],
    ['layers is missing', (config) => delete config['layers']],
    ['layers is not an object', (config) => (config['layers'] = true)],
    ['a layer flag is not a boolean', (config) => {
      (config['layers'] as Record<string, unknown>)['prune'] = 1;
    }],
    ['adFields is not an array', (config) => (config['adFields'] = 'adPlacements')],
    ['adFields holds an empty string', (config) => (config['adFields'] = [''])],
    ['adFields holds a non-string', (config) => (config['adFields'] = [123])],
    ['an adFields item exceeds the length cap', (config) => {
      config['adFields'] = ['x'.repeat(YOUTUBE_CONFIG_MAX.itemLength + 1)];
    }],
    ['adFields exceeds the count cap', (config) => {
      config['adFields'] = Array.from(
        { length: YOUTUBE_CONFIG_MAX.adFields + 1 },
        (_value, index) => `field${index}`,
      );
    }],
    ['endpoints holds a non-string', (config) => (config['endpoints'] = ['/ok', 5])],
    ['selectors exceeds the count cap', (config) => {
      config['selectors'] = Array.from(
        { length: YOUTUBE_CONFIG_MAX.selectors + 1 },
        (_value, index) => `#s${index}`,
      );
    }],
    ['skipSelectors is missing', (config) => delete config['skipSelectors']],
  ];

  for (const [name, mutate] of cases) {
    it(`rejects a config where ${name}`, () => {
      const config = clone();
      mutate(config);
      expect(isYouTubeConfig(config)).toBe(false);
    });
  }
});

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

describe('YouTubeModuleSettings', () => {
  it('is off by default (AC-15.1)', async () => {
    const settings = new YouTubeModuleSettings(new TypedStorage(createFakeArea()));
    await expect(settings.isEnabled()).resolves.toBe(false);
  });

  it('setEnabled persists the choice', async () => {
    const settings = new YouTubeModuleSettings(new TypedStorage(createFakeArea()));

    await settings.setEnabled(true);
    await expect(settings.isEnabled()).resolves.toBe(true);

    await settings.setEnabled(false);
    await expect(settings.isEnabled()).resolves.toBe(false);
  });
});
