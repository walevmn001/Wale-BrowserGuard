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
  readonly injectCosmetic: ReturnType<typeof vi.fn>;
  readonly injectAdSkip: ReturnType<typeof vi.fn>;
  readonly injectHealth: ReturnType<typeof vi.fn>;
}

function makeModule(
  options: {
    enabled?: boolean;
    config?: YouTubeConfig | undefined;
    q2Disabled?: boolean;
    moduleDisabled?: boolean;
  } = {},
): Harness {
  const injectPrune = vi.fn(async () => {});
  const injectCosmetic = vi.fn(async () => {});
  const injectAdSkip = vi.fn(async () => {});
  const injectHealth = vi.fn(async () => {});
  const deps: YouTubeModuleDeps = {
    settings: { isEnabled: async () => options.enabled ?? true },
    loadConfig: async () => ('config' in options ? options.config : makeConfig()),
    injectPrune,
    injectCosmetic,
    injectAdSkip,
    injectHealth,
    healthState: async () => ({
      q2Disabled: options.q2Disabled ?? false,
      moduleDisabled: options.moduleDisabled ?? false,
    }),
  };
  return { module: new YouTubeModule(deps), injectPrune, injectCosmetic, injectAdSkip, injectHealth };
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
    const { module, injectPrune, injectCosmetic } = makeModule();

    await module.handleTab(1, 'https://example.org/watch', 'complete');

    expect(injectPrune).not.toHaveBeenCalled();
    expect(injectCosmetic).not.toHaveBeenCalled();
  });

  it('does nothing while the module switch is off (opt-in, AC-15.1)', async () => {
    const { module, injectPrune, injectCosmetic } = makeModule({ enabled: false });

    await module.handleTab(1, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectPrune).not.toHaveBeenCalled();
    expect(injectCosmetic).not.toHaveBeenCalled();
  });

  it('honours the Q6 kill-switch: a disabled config runs nothing', async () => {
    const { module, injectPrune, injectCosmetic } = makeModule({
      config: makeConfig({ enabled: false }),
    });

    await module.handleTab(1, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectPrune).not.toHaveBeenCalled();
    expect(injectCosmetic).not.toHaveBeenCalled();
  });

  it('runs nothing when the config is unusable', async () => {
    const { module, injectPrune, injectCosmetic } = makeModule({ config: undefined });

    await module.handleTab(1, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectPrune).not.toHaveBeenCalled();
    expect(injectCosmetic).not.toHaveBeenCalled();
  });

  it('skips the prune layer when its flag is off', async () => {
    const config = makeConfig({
      layers: { network: true, prune: false, cosmetic: true, skip: true, health: true },
    });
    const { module, injectPrune } = makeModule({ config });

    await module.handleTab(1, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectPrune).not.toHaveBeenCalled();
  });

  it('injects the prune layer for an enabled YouTube navigation', async () => {
    const config = makeConfig();
    const { module, injectPrune } = makeModule({ config });

    await module.handleTab(7, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectPrune).toHaveBeenCalledWith(7, config);
  });

  it('injects the cosmetic layer on the complete pass (Q3)', async () => {
    const { module, injectCosmetic } = makeModule();

    await module.handleTab(3, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectCosmetic).toHaveBeenCalledWith(3, 'https://www.youtube.com/watch?v=abc');
  });

  it('does not inject CSS on the early loading pass (Q3 waits for the DOM)', async () => {
    const { module, injectCosmetic } = makeModule();

    await module.handleTab(3, 'https://www.youtube.com/watch?v=abc', 'loading');

    expect(injectCosmetic).not.toHaveBeenCalled();
  });

  it('skips the cosmetic layer when its flag is off', async () => {
    const config = makeConfig({
      layers: { network: true, prune: true, cosmetic: false, skip: true, health: true },
    });
    const { module, injectCosmetic } = makeModule({ config });

    await module.handleTab(3, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectCosmetic).not.toHaveBeenCalled();
  });

  it('injects the ad-skip layer on the complete pass (Q4)', async () => {
    const config = makeConfig();
    const { module, injectAdSkip } = makeModule({ config });

    await module.handleTab(4, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectAdSkip).toHaveBeenCalledWith(4, config);
  });

  it('does not inject the ad-skip observer on the early loading pass (Q4)', async () => {
    const { module, injectAdSkip } = makeModule();

    await module.handleTab(4, 'https://www.youtube.com/watch?v=abc', 'loading');

    expect(injectAdSkip).not.toHaveBeenCalled();
  });

  it('skips the ad-skip layer when its flag is off', async () => {
    const config = makeConfig({
      layers: { network: true, prune: true, cosmetic: true, skip: false, health: true },
    });
    const { module, injectAdSkip } = makeModule({ config });

    await module.handleTab(4, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectAdSkip).not.toHaveBeenCalled();
  });

  it('injects the health monitor on the complete pass (Q5)', async () => {
    const { module, injectHealth } = makeModule();

    await module.handleTab(5, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectHealth).toHaveBeenCalledWith(5);
  });

  it('does not inject the health monitor on the early loading pass (Q5)', async () => {
    const { module, injectHealth } = makeModule();

    await module.handleTab(5, 'https://www.youtube.com/watch?v=abc', 'loading');

    expect(injectHealth).not.toHaveBeenCalled();
  });

  it('skips the health monitor when its flag is off', async () => {
    const config = makeConfig({
      layers: { network: true, prune: true, cosmetic: true, skip: true, health: false },
    });
    const { module, injectHealth } = makeModule({ config });

    await module.handleTab(5, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectHealth).not.toHaveBeenCalled();
  });

  it('drops the Q2 prune for the session once it was degraded (Q5)', async () => {
    const { module, injectPrune, injectCosmetic } = makeModule({ q2Disabled: true });

    await module.handleTab(7, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectPrune).not.toHaveBeenCalled();
    // The other layers keep running: only the prune is dropped.
    expect(injectCosmetic).toHaveBeenCalledWith(7, 'https://www.youtube.com/watch?v=abc');
  });

  it('runs nothing once the whole module was degraded for the session (Q5)', async () => {
    const { module, injectPrune, injectCosmetic, injectAdSkip, injectHealth } = makeModule({
      moduleDisabled: true,
    });

    await module.handleTab(7, 'https://www.youtube.com/watch?v=abc', 'complete');

    expect(injectPrune).not.toHaveBeenCalled();
    expect(injectCosmetic).not.toHaveBeenCalled();
    expect(injectAdSkip).not.toHaveBeenCalled();
    expect(injectHealth).not.toHaveBeenCalled();
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
