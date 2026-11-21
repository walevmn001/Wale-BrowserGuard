import { describe, expect, it } from 'vitest';

import {
  Whitelist,
  WHITELIST_RULE_ID_BASE,
  buildAllowAllRule,
  whitelistRuleId,
} from '../../src/background/whitelist';
import { PRIORITY } from '../../src/shared/constants';
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
  readonly whitelist: Whitelist;
  readonly calls: chrome.declarativeNetRequest.UpdateRuleOptions[];
  installedRules(): chrome.declarativeNetRequest.Rule[];
  seedRule(rule: chrome.declarativeNetRequest.Rule): void;
}

function createHarness(): Harness {
  const calls: chrome.declarativeNetRequest.UpdateRuleOptions[] = [];
  const rules = new Map<number, chrome.declarativeNetRequest.Rule>();
  const whitelist = new Whitelist({
    storage: new TypedStorage(createFakeArea()),
    getDynamicRules: async () => [...rules.values()],
    // Mirror the real API: `updateDynamicRules` removes the given ids and
    // upserts the given rules in one call.
    updateDynamicRules: async (options) => {
      calls.push(options);
      for (const id of options.removeRuleIds ?? []) {
        rules.delete(id);
      }
      for (const rule of options.addRules ?? []) {
        rules.set(rule.id, rule);
      }
    },
  });
  return {
    whitelist,
    calls,
    installedRules: () => [...rules.values()],
    seedRule: (rule) => {
      rules.set(rule.id, rule);
    },
  };
}

describe('whitelistRuleId', () => {
  it('is deterministic and lives in the private id range', () => {
    const id = whitelistRuleId('example.com');

    expect(whitelistRuleId('example.com')).toBe(id);
    expect(id).toBeGreaterThanOrEqual(WHITELIST_RULE_ID_BASE);
  });

  it('maps different domains to different ids', () => {
    expect(whitelistRuleId('example.com')).not.toBe(whitelistRuleId('example.org'));
  });
});

describe('buildAllowAllRule', () => {
  it('allows every frame request from the domain at the top priority', () => {
    expect(buildAllowAllRule('example.com')).toEqual({
      id: whitelistRuleId('example.com'),
      priority: PRIORITY.WHITELIST_ALLOW_ALL,
      action: { type: 'allowAllRequests' },
      condition: {
        requestDomains: ['example.com'],
        resourceTypes: ['main_frame', 'sub_frame'],
      },
    });
  });
});

describe('Whitelist', () => {
  it('starts empty', async () => {
    const { whitelist } = createHarness();

    await expect(whitelist.list()).resolves.toEqual([]);
    await expect(whitelist.isAllowed('example.com')).resolves.toBe(false);
  });

  it('publishes the desired list without touching the dynamic rules itself', async () => {
    const { whitelist, calls } = createHarness();

    await whitelist.setEnabled('example.com', true);

    await expect(whitelist.list()).resolves.toEqual(['example.com']);
    await expect(whitelist.isAllowed('example.com')).resolves.toBe(true);
    // `setEnabled` is a storage-only writer; the worker applies the rules.
    expect(calls).toEqual([]);
  });

  it('is idempotent: adding the same domain twice keeps one entry and one write', async () => {
    const { whitelist, calls } = createHarness();

    await whitelist.setEnabled('example.com', true);
    await whitelist.setEnabled('example.com', true);

    await expect(whitelist.list()).resolves.toEqual(['example.com']);
    expect(calls).toEqual([]);
  });

  it('removes a domain from the list', async () => {
    const { whitelist } = createHarness();

    await whitelist.setEnabled('example.com', true);
    await whitelist.setEnabled('example.com', false);

    await expect(whitelist.list()).resolves.toEqual([]);
  });

  it('is idempotent when removing a domain that was never added', async () => {
    const { whitelist } = createHarness();

    await whitelist.setEnabled('example.com', false);
    await whitelist.setEnabled('example.com', false);

    await expect(whitelist.list()).resolves.toEqual([]);
  });

  it('applyStored installs one allowAllRequests rule per stored domain', async () => {
    const { whitelist, calls, installedRules } = createHarness();

    await whitelist.setEnabled('example.com', true);
    await whitelist.setEnabled('example.org', true);

    await whitelist.applyStored();

    expect(calls).toEqual([
      {
        removeRuleIds: [],
        addRules: [buildAllowAllRule('example.com'), buildAllowAllRule('example.org')],
      },
    ]);
    expect(installedRules()).toEqual([
      buildAllowAllRule('example.com'),
      buildAllowAllRule('example.org'),
    ]);
  });

  it('applyStored removes rules whose domain left the list', async () => {
    const { whitelist, calls, installedRules } = createHarness();

    await whitelist.setEnabled('example.com', true);
    await whitelist.applyStored();
    await whitelist.setEnabled('example.com', false);
    await whitelist.applyStored();

    expect(installedRules()).toEqual([]);
    expect(calls.at(-1)).toEqual({
      removeRuleIds: [whitelistRuleId('example.com')],
      addRules: [],
    });
  });

  it('applyStored does nothing when the list is empty and no rule is installed', async () => {
    const { whitelist, calls } = createHarness();

    await whitelist.applyStored();

    expect(calls).toEqual([]);
  });

  it('applyStored leaves dynamic rules outside the whitelist range alone', async () => {
    const { whitelist, calls, installedRules, seedRule } = createHarness();
    const foreign: chrome.declarativeNetRequest.Rule = {
      id: 5,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: 'example' },
    };
    seedRule(foreign);

    await whitelist.applyStored();

    expect(calls).toEqual([]);
    expect(installedRules()).toEqual([foreign]);
  });

  it('applyStored is idempotent: re-running it keeps a single rule per domain', async () => {
    const { whitelist, calls, installedRules } = createHarness();

    await whitelist.setEnabled('example.com', true);
    await whitelist.applyStored();
    await whitelist.applyStored();

    expect(installedRules()).toEqual([buildAllowAllRule('example.com')]);
    expect(calls).toHaveLength(2);
  });
});
