import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isYouTubeHost,
  loadPackagedYouTubeConfig,
  YouTubeModule,
  type YouTubeModuleDeps,
} from '../../src/background/youtube-module';
import type { YouTubeConfig } from '../../src/shared/youtube-config';

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
  readonly module: YouTubeModule;
  readonly injectPrune: ReturnType<typeof vi.fn>;
}

function makeModule(
  options: {
    enabled?: boolean;
    config?: YouTubeConfig | undefined;
  } = {},
): Harness {
  const injectPrune = vi.fn(async () => {});
  const deps: YouTubeModuleDeps = {
    settings: { isEnabled: async () => options.enabled ?? true },
    loadConfig: async () => ('config' in options ? options.config : makeConfig()),
    injectPrune,
  };
  return { module: new YouTubeModule(deps), injectPrune };
}

describe('isYouTubeHost', () => {
  it('accepts the youtube.com family only', () => {
    expect(isYouTubeHost('youtube.com')).toBe(true);
    expect(isYouTubeHost('www.youtube.com')).toBe(true);
    expect(isYouTubeHost('m.youtube.com')).toBe(true);
    expect(isYouTubeHost('notyoutube.com')).toBe(false);
    expect(isYouTubeHost('youtube.com.evil.test')).toBe(false);
  });
});

describe('YouTubeModule.handleTab', () => {
  it('ignores a non-YouTube navigation', async () => {
    const { module, injectPrune } = makeModule();

    await module.handleTab(1, 'https://example.org/watch');

    expect(injectPrune).not.toHaveBeenCalled();
  });

  it('does nothing while the module switch is off (opt-in, AC-15.1)', async () => {
    const { module, injectPrune } = makeModule({ enabled: false });

    await module.handleTab(1, 'https://www.youtube.com/watch?v=abc');

    expect(injectPrune).not.toHaveBeenCalled();
  });

  it('honours the Q6 kill-switch: a disabled config runs nothing', async () => {
    const { module, injectPrune } = makeModule({ config: makeConfig({ enabled: false }) });

    await module.handleTab(1, 'https://www.youtube.com/watch?v=abc');

    expect(injectPrune).not.toHaveBeenCalled();
  });

  it('runs nothing when the config is unusable', async () => {
    const { module, injectPrune } = makeModule({ config: undefined });

    await module.handleTab(1, 'https://www.youtube.com/watch?v=abc');

    expect(injectPrune).not.toHaveBeenCalled();
  });

  it('skips the prune layer when its flag is off', async () => {
    const config = makeConfig({
      layers: { network: true, prune: false, cosmetic: true, skip: true, health: true },
    });
    const { module, injectPrune } = makeModule({ config });

    await module.handleTab(1, 'https://www.youtube.com/watch?v=abc');

    expect(injectPrune).not.toHaveBeenCalled();
  });

  it('injects the prune layer for an enabled YouTube navigation', async () => {
    const config = makeConfig();
    const { module, injectPrune } = makeModule({ config });

    await module.handleTab(7, 'https://www.youtube.com/watch?v=abc');

    expect(injectPrune).toHaveBeenCalledWith(7, config);
  });
});

describe('loadPackagedYouTubeConfig', () => {
  const globals = globalThis as unknown as Record<string, unknown>;

  afterEach(() => {
    delete globals['chrome'];
    delete globals['fetch'];
  });

  function stubFetch(payload: unknown, ok = true): void {
    globals['chrome'] = { runtime: { getURL: (path: string) => `chrome-extension://id/${path}` } };
    globals['fetch'] = vi.fn(async () => ({
      json: async () => payload,
      ok,
    }));
  }

  it('returns the config when the packaged file is valid', async () => {
    const config = makeConfig();
    stubFetch(config);

    await expect(loadPackagedYouTubeConfig()).resolves.toEqual(config);
  });

  it('returns undefined for a malformed config (fail-open)', async () => {
    stubFetch({ version: 'nope' });

    await expect(loadPackagedYouTubeConfig()).resolves.toBeUndefined();
  });

  it('returns undefined when reading the file fails (fail-open)', async () => {
    globals['chrome'] = { runtime: { getURL: (path: string) => path } };
    globals['fetch'] = vi.fn(async () => {
      throw new Error('offline');
    });

    await expect(loadPackagedYouTubeConfig()).resolves.toBeUndefined();
  });
});
