import { describe, expect, it } from 'vitest';

import {
  RulesetManager,
  ruleSetIdsFromManifest,
  type ManifestRuleResources,
  type UpdateEnabledRulesetsOptions,
} from '../../src/background/ruleset-manager';
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

interface Harness {
  readonly manager: RulesetManager;
  readonly calls: UpdateEnabledRulesetsOptions[];
}

function createHarness(ruleSetIds: readonly string[] = ['ads', 'trackers']): Harness {
  const calls: UpdateEnabledRulesetsOptions[] = [];
  const manager = new RulesetManager({
    storage: new TypedStorage(createFakeArea()),
    ruleSetIds,
    updateEnabledRulesets: async (options) => {
      calls.push(options);
    },
  });
  return { manager, calls };
}

describe('RulesetManager', () => {
  it('defaults to enabled when nothing is stored', async () => {
    const { manager } = createHarness();

    await expect(manager.isEnabled()).resolves.toBe(true);
  });

  it('setEnabled(false) persists the switch and disables every ruleset', async () => {
    const { manager, calls } = createHarness();

    await manager.setEnabled(false);

    expect(calls).toEqual([{ disableRulesetIds: ['ads', 'trackers'] }]);
    await expect(manager.isEnabled()).resolves.toBe(false);
  });

  it('setEnabled(true) re-enables every ruleset', async () => {
    const { manager, calls } = createHarness();

    await manager.setEnabled(false);
    await manager.setEnabled(true);

    expect(calls.at(-1)).toEqual({ enableRulesetIds: ['ads', 'trackers'] });
  });

  it('applyStored applies the stored value and returns it', async () => {
    const { manager, calls } = createHarness();

    await expect(manager.applyStored()).resolves.toBe(true);
    expect(calls.at(-1)).toEqual({ enableRulesetIds: ['ads', 'trackers'] });

    await manager.setEnabled(false);
    await expect(manager.applyStored()).resolves.toBe(false);
    expect(calls.at(-1)).toEqual({ disableRulesetIds: ['ads', 'trackers'] });
  });

  it('does nothing when there are no rulesets', async () => {
    const { manager, calls } = createHarness([]);

    await manager.setEnabled(false);

    expect(calls).toEqual([]);
  });
});

describe('ruleSetIdsFromManifest', () => {
  it('reads the ids out of the declared static rulesets', () => {
    const manifest: ManifestRuleResources = {
      declarative_net_request: {
        rule_resources: [{ id: 'ads' }, { id: 'trackers' }],
      },
    };

    expect(ruleSetIdsFromManifest(manifest)).toEqual(['ads', 'trackers']);
  });

  it('returns an empty list when no static rulesets are declared', () => {
    expect(ruleSetIdsFromManifest({})).toEqual([]);
  });
});
