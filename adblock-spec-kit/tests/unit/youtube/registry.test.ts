import { describe, expect, it, vi } from 'vitest';

import { FeatureFlags } from '../../../src/youtube/config/flags';
import { DebugLogger } from '../../../src/youtube/core/debug-logger';
import { LifecycleManager } from '../../../src/youtube/core/lifecycle-manager';
import type { ModuleContext, ModuleStatus, YouTubeModule } from '../../../src/youtube/core/module';
import { ModuleRegistry } from '../../../src/youtube/core/registry';
import { createEndpointRegistry } from '../../../src/youtube/registry/endpoints';
import { createSelectorRegistry } from '../../../src/youtube/registry/selectors';

function context(): ModuleContext {
  return {
    flags: new FeatureFlags(),
    logger: new DebugLogger(),
    lifecycle: new LifecycleManager(),
    selectors: createSelectorRegistry(),
    endpoints: createEndpointRegistry(),
  };
}

function module(name: string, overrides: Partial<YouTubeModule> = {}): YouTubeModule {
  return {
    name,
    init: vi.fn(),
    dispose: vi.fn(),
    status: (): ModuleStatus => ({ name, enabled: true, failures: 0, lastError: null }),
    ...overrides,
  };
}

describe('ModuleRegistry', () => {
  it('registers a module and retrieves it by name', () => {
    const registry = new ModuleRegistry();
    const entry = module('a');

    registry.register(entry);

    expect(registry.get('a')).toBe(entry);
    expect(registry.get('missing')).toBeUndefined();
  });

  it('throws a plain Error on a duplicate name', () => {
    const registry = new ModuleRegistry();
    registry.register(module('dup'));

    expect(() => registry.register(module('dup'))).toThrow('duplicate module name: dup');
  });

  it('initialises every module with the context', async () => {
    const registry = new ModuleRegistry();
    const init = vi.fn();
    registry.register(module('a', { init }));
    const ctx = context();

    await registry.initAll(ctx);

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(ctx);
  });

  it('isolates a failing module, records the failure and still starts the rest', async () => {
    const registry = new ModuleRegistry();
    const good = vi.fn();
    registry.register(
      module('bad', {
        init: () => {
          throw new Error('init boom');
        },
      }),
    );
    registry.register(module('good', { init: good }));

    await registry.initAll(context());

    const statuses = registry.statusAll();
    const bad = statuses.find((entry) => entry.name === 'bad');
    const ok = statuses.find((entry) => entry.name === 'good');
    expect(bad?.enabled).toBe(false);
    expect(bad?.failures).toBe(1);
    expect(bad?.lastError).toBe('init boom');
    expect(ok?.enabled).toBe(true);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('disposes every module exactly once across repeated calls', async () => {
    const registry = new ModuleRegistry();
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    registry.register(module('a', { dispose: disposeA }));
    registry.register(module('b', { dispose: disposeB }));

    await registry.disposeAll();
    await registry.disposeAll();

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
  });

  it('continues disposing the rest when one module throws', async () => {
    const registry = new ModuleRegistry();
    const ok = vi.fn();
    registry.register(
      module('bad', {
        dispose: () => {
          throw new Error('boom');
        },
      }),
    );
    registry.register(module('ok', { dispose: ok }));

    await expect(registry.disposeAll()).resolves.toBeUndefined();
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('does not throw when a module status throws, and reports the registry record', () => {
    const registry = new ModuleRegistry();
    registry.register(
      module('s', {
        status: () => {
          throw new Error('status boom');
        },
      }),
    );

    let statuses: readonly ModuleStatus[] = [];
    expect(() => {
      statuses = registry.statusAll();
    }).not.toThrow();
    expect(statuses).toEqual([{ name: 's', enabled: true, failures: 0, lastError: null }]);
  });
});

describe('LifecycleManager', () => {
  it('runs a registered cleanup on disposeAll and clears it', () => {
    const lifecycle = new LifecycleManager();
    const cleanup = vi.fn();
    lifecycle.add(cleanup);

    expect(lifecycle.size()).toBe(1);
    lifecycle.disposeAll();

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(lifecycle.size()).toBe(0);
  });

  it('removes a cleanup via its unsubscribe function', () => {
    const lifecycle = new LifecycleManager();
    const cleanup = vi.fn();
    const remove = lifecycle.add(cleanup);

    remove();

    expect(lifecycle.size()).toBe(0);
    lifecycle.disposeAll();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('runs every cleanup even when one throws', () => {
    const lifecycle = new LifecycleManager();
    const second = vi.fn();
    lifecycle.add(() => {
      throw new Error('boom');
    });
    lifecycle.add(second);

    expect(() => lifecycle.disposeAll()).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('disposes each cleanup exactly once across two calls', () => {
    const lifecycle = new LifecycleManager();
    const cleanup = vi.fn();
    lifecycle.add(cleanup);

    lifecycle.disposeAll();
    lifecycle.disposeAll();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
