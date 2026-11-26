import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { FLAG_NAMES } from '../../../src/youtube/config/flags';
import type { ModuleStatus, YouTubeModule } from '../../../src/youtube/core/module';
import { ModuleRegistry } from '../../../src/youtube/core/registry';

/** The documented flag names, in the mandated order (spec A-3). */
const EXPECTED_FLAGS = [
  'ENABLE_JSON_PRUNER',
  'ENABLE_FETCH_HOOK',
  'ENABLE_XHR_HOOK',
  'ENABLE_DNR',
  'ENABLE_RUNTIME_GUARD',
  'ENABLE_PLAYBACK_WATCHDOG',
  'ENABLE_RECOVERY',
  'ENABLE_CSS_HIDER',
  'ENABLE_AD_STATE_MACHINE',
  'ENABLE_SPA_NAVIGATION',
  'ENABLE_DOM_OBSERVER',
  'ENABLE_DEBUG_LOGGER',
] as const;

describe('architecture — flag schema', () => {
  it('exposes exactly the twelve documented flags, in order', () => {
    expect(FLAG_NAMES).toHaveLength(12);
    expect([...FLAG_NAMES]).toEqual([...EXPECTED_FLAGS]);
  });
});

describe('architecture — module registry contract', () => {
  function module(name: string, dispose = vi.fn()): YouTubeModule {
    return {
      name,
      init: vi.fn(),
      dispose,
      status: (): ModuleStatus => ({ name, enabled: true, failures: 0, lastError: null }),
    };
  }

  it('keeps module names unique (a duplicate is rejected)', () => {
    const registry = new ModuleRegistry();
    registry.register(module('a'));
    registry.register(module('b'));

    expect(() => registry.register(module('a'))).toThrow();

    const names = registry.statusAll().map((status) => status.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('disposes each module exactly once across repeated disposeAll calls', async () => {
    const registry = new ModuleRegistry();
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    registry.register(module('a', disposeA));
    registry.register(module('b', disposeB));

    await registry.disposeAll();
    await registry.disposeAll();

    expect(disposeA).toHaveBeenCalledTimes(1);
    expect(disposeB).toHaveBeenCalledTimes(1);
  });
});

describe('architecture — world independence', () => {
  /** `window.`, `document.` or `chrome.` as a bare (non-member) token. */
  const WORLDLY = /(^|[^A-Za-z0-9_$])(window|document|chrome)\./;
  const PURE_DIRS = ['core', 'config', 'registry', 'adapter', 'state'];
  const ROOT = fileURLToPath(new URL('../../../src/youtube/', import.meta.url));

  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...tsFiles(full));
      } else if (entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  it('scans every pure module and finds no window./document./chrome. reference', () => {
    const scanned: string[] = [];
    const offenders: string[] = [];
    for (const dir of PURE_DIRS) {
      for (const file of tsFiles(join(ROOT, dir))) {
        scanned.push(file);
        if (WORLDLY.test(readFileSync(file, 'utf8'))) {
          offenders.push(file);
        }
      }
    }

    // Guard against a silently empty scan.
    expect(scanned.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
