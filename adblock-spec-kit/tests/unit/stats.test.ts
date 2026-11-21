import { describe, expect, it } from 'vitest';

import { StatsCounter, type StatsDeps } from '../../src/background/stats';
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

function match(tabId: number, timeStamp: number): chrome.declarativeNetRequest.MatchedRuleInfo {
  return { rule: { ruleId: 1, rulesetId: 'ads' }, tabId, timeStamp };
}

interface Harness {
  readonly counter: StatsCounter;
  readonly filters: (chrome.declarativeNetRequest.MatchedRulesFilter | undefined)[];
  setMatches(matches: chrome.declarativeNetRequest.MatchedRuleInfo[]): void;
}

function createHarness(): Harness {
  const filters: (chrome.declarativeNetRequest.MatchedRulesFilter | undefined)[] = [];
  let matches: chrome.declarativeNetRequest.MatchedRuleInfo[] = [];
  const deps: StatsDeps = {
    storage: new TypedStorage(createFakeArea()),
    getMatchedRules: async (filter) => {
      filters.push(filter);
      return { rulesMatchedInfo: matches };
    },
  };
  return {
    counter: new StatsCounter(deps),
    filters,
    setMatches: (next) => {
      matches = next;
    },
  };
}

describe('StatsCounter', () => {
  it('counts matches into the per-tab and overall totals', async () => {
    const { counter, setMatches } = createHarness();
    setMatches([match(7, 1_000), match(7, 1_100), match(9, 1_200)]);

    await expect(counter.poll()).resolves.toBe(3);

    await expect(counter.snapshot()).resolves.toEqual({ total: 3, byTab: { '7': 2, '9': 1 } });
    await expect(counter.forTab(7)).resolves.toBe(2);
    await expect(counter.forTab(9)).resolves.toBe(1);
  });

  it('polls from the stored cursor so matches are never counted twice', async () => {
    const { counter, filters, setMatches } = createHarness();
    setMatches([match(7, 1_000)]);
    await counter.poll();

    // Nothing new: the second poll must not change the totals.
    setMatches([]);
    await expect(counter.poll()).resolves.toBe(0);

    await expect(counter.snapshot()).resolves.toEqual({ total: 1, byTab: { '7': 1 } });
    expect(filters).toEqual([{ minTimeStamp: 0 }, { minTimeStamp: 1_000 }]);
  });

  it('adds only the new matches on a later poll', async () => {
    const { counter, setMatches } = createHarness();
    setMatches([match(7, 1_000)]);
    await counter.poll();

    setMatches([match(7, 2_000), match(7, 2_100)]);
    await expect(counter.poll()).resolves.toBe(2);

    await expect(counter.snapshot()).resolves.toEqual({ total: 3, byTab: { '7': 3 } });
  });

  it('resets the totals but keeps the cursor', async () => {
    const { counter, filters, setMatches } = createHarness();
    setMatches([match(7, 1_000)]);
    await counter.poll();

    await counter.reset();

    await expect(counter.snapshot()).resolves.toEqual({ total: 0, byTab: {} });
    await expect(counter.forTab(7)).resolves.toBe(0);

    setMatches([]);
    await counter.poll();
    expect(filters.at(-1)).toEqual({ minTimeStamp: 1_000 });
  });

  it('starts at zero when nothing has been stored', async () => {
    const { counter } = createHarness();

    await expect(counter.snapshot()).resolves.toEqual({ total: 0, byTab: {} });
    await expect(counter.forTab(42)).resolves.toBe(0);
  });
});
