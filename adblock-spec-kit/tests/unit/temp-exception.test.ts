import { describe, expect, it } from 'vitest';

import {
  TempException,
  TEMP_EXCEPTION_MS,
  TEMP_EXCEPTION_RULE_ID_BASE,
  buildTempAllowRule,
  tempExceptionRuleId,
} from '../../src/background/temp-exception';
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

type AlarmEvent = { readonly kind: 'set'; readonly whenMs: number } | { readonly kind: 'clear' };

interface Harness {
  readonly temp: TempException;
  readonly calls: chrome.declarativeNetRequest.UpdateRuleOptions[];
  readonly alarms: AlarmEvent[];
  installedRules(): chrome.declarativeNetRequest.Rule[];
  seedRule(rule: chrome.declarativeNetRequest.Rule): void;
  setNow(ms: number): void;
}

function createHarness(): Harness {
  const calls: chrome.declarativeNetRequest.UpdateRuleOptions[] = [];
  const alarms: AlarmEvent[] = [];
  const rules = new Map<number, chrome.declarativeNetRequest.Rule>();
  let currentTime = 0;
  const temp = new TempException({
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
    now: () => currentTime,
    setAlarm: (whenMs) => alarms.push({ kind: 'set', whenMs }),
    clearAlarm: async () => {
      alarms.push({ kind: 'clear' });
    },
  });
  return {
    temp,
    calls,
    alarms,
    installedRules: () => [...rules.values()],
    seedRule: (rule) => {
      rules.set(rule.id, rule);
    },
    setNow: (ms) => {
      currentTime = ms;
    },
  };
}

const HOST = 'malware.example';

describe('tempExceptionRuleId', () => {
  it('is deterministic and lives in the private id range', () => {
    const id = tempExceptionRuleId(HOST);

    expect(tempExceptionRuleId(HOST)).toBe(id);
    expect(id).toBeGreaterThanOrEqual(TEMP_EXCEPTION_RULE_ID_BASE);
  });

  it('maps different hosts to different ids in the malware-block gap', () => {
    expect(tempExceptionRuleId(HOST)).not.toBe(tempExceptionRuleId('other.example'));
    expect(tempExceptionRuleId(HOST)).toBeGreaterThan(PRIORITY.MALWARE_BLOCK);
  });
});

describe('buildTempAllowRule', () => {
  it('allows every frame request from the host at the top priority', () => {
    expect(buildTempAllowRule(HOST)).toEqual({
      id: tempExceptionRuleId(HOST),
      priority: PRIORITY.WHITELIST_ALLOW_ALL,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: [HOST], resourceTypes: ['main_frame', 'sub_frame'] },
    });
  });
});

describe('TempException', () => {
  it('allow publishes a 10-minute expiry without touching the dynamic rules', async () => {
    const { temp, calls } = createHarness();

    await temp.allow(HOST);

    await expect(temp.stored()).resolves.toEqual({ [HOST]: TEMP_EXCEPTION_MS });
    // `allow` is a storage-only writer; the worker applies the rules.
    expect(calls).toEqual([]);
  });

  it('allow extends the expiry when the same host is granted again', async () => {
    const { temp, setNow } = createHarness();

    await temp.allow(HOST);
    setNow(100_000);
    await temp.allow(HOST);

    await expect(temp.stored()).resolves.toEqual({ [HOST]: 100_000 + TEMP_EXCEPTION_MS });
  });

  it('applyStored installs one allow rule and arms the alarm at the expiry', async () => {
    const { temp, calls, alarms, installedRules } = createHarness();

    await temp.allow(HOST);
    await temp.applyStored();

    expect(calls).toEqual([{ removeRuleIds: [], addRules: [buildTempAllowRule(HOST)] }]);
    expect(installedRules()).toEqual([buildTempAllowRule(HOST)]);
    expect(alarms).toEqual([{ kind: 'set', whenMs: TEMP_EXCEPTION_MS }]);
    await expect(temp.isActive(HOST)).resolves.toBe(true);
  });

  it('prunes a lapsed host, removes its rule and clears the alarm', async () => {
    const { temp, calls, alarms, installedRules, setNow } = createHarness();

    await temp.allow(HOST);
    await temp.applyStored();
    setNow(TEMP_EXCEPTION_MS + 1);
    await temp.applyStored();

    await expect(temp.stored()).resolves.toEqual({});
    await expect(temp.isActive(HOST)).resolves.toBe(false);
    expect(installedRules()).toEqual([]);
    expect(calls.at(-1)).toEqual({
      removeRuleIds: [tempExceptionRuleId(HOST)],
      addRules: [],
    });
    expect(alarms.at(-1)).toEqual({ kind: 'clear' });
  });

  it('arms the alarm at the earliest expiry when several hosts are live', async () => {
    const { temp, alarms, setNow } = createHarness();

    await temp.allow('first.example');
    setNow(60_000);
    await temp.allow('second.example');
    await temp.applyStored();

    expect(alarms).toEqual([{ kind: 'set', whenMs: TEMP_EXCEPTION_MS }]);
  });

  it('applyStored does nothing but clear the alarm when no host is live', async () => {
    const { temp, calls, alarms } = createHarness();

    await temp.applyStored();

    expect(calls).toEqual([]);
    expect(alarms).toEqual([{ kind: 'clear' }]);
  });

  it('applyStored leaves dynamic rules outside the temp-exception range alone', async () => {
    const { temp, calls, installedRules, seedRule } = createHarness();
    const foreign: chrome.declarativeNetRequest.Rule = {
      id: 5,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: 'example' },
    };
    seedRule(foreign);

    await temp.applyStored();

    expect(calls).toEqual([]);
    expect(installedRules()).toEqual([foreign]);
  });

  it('applyStored is idempotent: re-running it keeps a single rule per host', async () => {
    const { temp, calls, installedRules } = createHarness();

    await temp.allow(HOST);
    await temp.applyStored();
    await temp.applyStored();

    expect(installedRules()).toEqual([buildTempAllowRule(HOST)]);
    expect(calls).toHaveLength(2);
  });
});
