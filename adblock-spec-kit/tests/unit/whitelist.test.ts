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
}

function createHarness(): Harness {
  const calls: chrome.declarativeNetRequest.UpdateRuleOptions[] = [];
  const whitelist = new Whitelist({
    storage: new TypedStorage(createFakeArea()),
    updateDynamicRules: async (options) => {
      calls.push(options);
    },
  });
  return { whitelist, calls };
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

  it('adds a domain and its allowAllRequests rule', async () => {
    const { whitelist, calls } = createHarness();

    await whitelist.setEnabled('example.com', true);

    expect(calls).toEqual([{ addRules: [buildAllowAllRule('example.com')] }]);
    await expect(whitelist.list()).resolves.toEqual(['example.com']);
    await expect(whitelist.isAllowed('example.com')).resolves.toBe(true);
  });

  it('is idempotent: adding the same domain twice keeps one rule and one entry', async () => {
    const { whitelist, calls } = createHarness();

    await whitelist.setEnabled('example.com', true);
    await whitelist.setEnabled('example.com', true);

    await expect(whitelist.list()).resolves.toEqual(['example.com']);
    expect(calls).toEqual([
      { addRules: [buildAllowAllRule('example.com')] },
      { addRules: [buildAllowAllRule('example.com')] },
    ]);
  });

  it('removes a domain and its rule by id', async () => {
    const { whitelist, calls } = createHarness();

    await whitelist.setEnabled('example.com', true);
    await whitelist.setEnabled('example.com', false);

    expect(calls.at(-1)).toEqual({ removeRuleIds: [whitelistRuleId('example.com')] });
    await expect(whitelist.list()).resolves.toEqual([]);
  });

  it('is idempotent when removing a domain that was never added', async () => {
    const { whitelist } = createHarness();

    await whitelist.setEnabled('example.com', false);
    await whitelist.setEnabled('example.com', false);

    await expect(whitelist.list()).resolves.toEqual([]);
  });

  it('re-applies every stored rule on applyStored', async () => {
    const { whitelist, calls } = createHarness();

    await whitelist.setEnabled('example.com', true);
    await whitelist.setEnabled('example.org', true);
    calls.length = 0;

    await whitelist.applyStored();

    expect(calls).toEqual([
      {
        addRules: [buildAllowAllRule('example.com'), buildAllowAllRule('example.org')],
      },
    ]);
  });

  it('does nothing on applyStored when the list is empty', async () => {
    const { whitelist, calls } = createHarness();

    await whitelist.applyStored();

    expect(calls).toEqual([]);
  });
});
