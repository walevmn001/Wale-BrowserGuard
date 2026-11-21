import { describe, expect, it } from 'vitest';

import {
  BACKOFF_MS,
  byteLength,
  classifyFetchError,
  countRules,
  FilterUpdater,
  nextDelayMs,
  UPDATE_INTERVAL_MS,
  validateText,
  type FilterSource,
  type FilterUpdaterDeps,
} from '../../src/background/filter-updater';
import { TypedStorage } from '../../src/shared/storage';
import type { FilterActiveSnapshot } from '../../src/shared/types';

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

const NOW = 1_700_000_000_000;
const VALID = '! comment\n||ads.example^\n||tracker.example^\n';

const SOURCES: FilterSource[] = [
  { id: 'ads', url: 'https://ads.test/list.txt', maxBytes: 1000, minRules: 1 },
  { id: 'trackers', url: 'https://trackers.test/list.txt', maxBytes: 1000, minRules: 1 },
];

interface Harness {
  readonly updater: FilterUpdater;
  readonly storage: TypedStorage;
  readonly alarms: { delayMs: number; periodic: boolean }[];
  setResponse(url: string, result: string | Error): void;
  setExistingAlarm(exists: boolean): void;
}

function createHarness(hash?: (text: string) => Promise<string>): Harness {
  const responses = new Map<string, string | Error>();
  const alarms: { delayMs: number; periodic: boolean }[] = [];
  let existingAlarm = false;
  const storage = new TypedStorage(createFakeArea());
  const deps: FilterUpdaterDeps = {
    storage,
    fetchText: async (url) => {
      const result = responses.get(url);
      if (result === undefined) {
        throw new Error('no response configured for ' + url);
      }
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
    hash: hash ?? (async (text) => `hash:${text.length}`),
    now: () => NOW,
    setAlarm: (delayMs, periodic) => {
      alarms.push({ delayMs, periodic });
    },
    getAlarm: async () => (existingAlarm ? { name: 'update-filters' } : undefined),
  };
  return {
    updater: new FilterUpdater(deps, SOURCES),
    storage,
    alarms,
    setResponse: (url, result) => {
      responses.set(url, result);
    },
    setExistingAlarm: (exists) => {
      existingAlarm = exists;
    },
  };
}

function setAll(h: Harness, result: string | Error): void {
  for (const source of SOURCES) {
    h.setResponse(source.url, result);
  }
}

const OLD: FilterActiveSnapshot = {
  updatedAt: NOW - 5_000_000,
  groups: { ads: { bytes: 10, rules: 1, checksum: 'old' } },
};

describe('pure helpers', () => {
  it('byteLength measures UTF-8 bytes', () => {
    expect(byteLength('ab')).toBe(2);
    expect(byteLength('é')).toBe(2);
  });

  it('countRules ignores blanks, comments and headers', () => {
    expect(countRules('! c\n[Adblock]\n\n||a^\n||b^\n')).toBe(2);
  });

  it('nextDelayMs walks 1h → 6h → 24h then clamps', () => {
    expect(nextDelayMs(1)).toBe(BACKOFF_MS[0]);
    expect(nextDelayMs(2)).toBe(BACKOFF_MS[1]);
    expect(nextDelayMs(3)).toBe(BACKOFF_MS[2]);
    expect(nextDelayMs(9)).toBe(BACKOFF_MS[2]);
    expect(nextDelayMs(0)).toBe(BACKOFF_MS[0]);
  });

  it('classifyFetchError maps aborts and HTTP failures', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(classifyFetchError(abort)).toBe('timeout');
    expect(classifyFetchError(new Error('HTTP 500'))).toBe('http-error');
    expect(classifyFetchError(new Error('boom'))).toBe('network');
    expect(classifyFetchError('boom')).toBe('network');
  });
});

describe('validateText', () => {
  const hash = async (text: string): Promise<string> => `h:${text.length}`;
  const source: FilterSource = { id: 's', url: 'u', maxBytes: 20, minRules: 1 };

  it('accepts a valid list and reports its size and rule count', async () => {
    await expect(validateText('||a^\n||b^\n', source, hash)).resolves.toEqual({
      ok: true,
      info: { bytes: 10, rules: 2, checksum: 'h:10' },
    });
  });

  it('rejects an oversized list', async () => {
    await expect(validateText('x'.repeat(21), source, hash)).resolves.toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('rejects a corrupt (NUL-bearing) payload', async () => {
    await expect(validateText('\u0000bin', source, hash)).resolves.toEqual({
      ok: false,
      reason: 'corrupt',
    });
  });

  it('rejects a list with too few rules', async () => {
    await expect(validateText('! just a comment\n', source, hash)).resolves.toEqual({
      ok: false,
      reason: 'too-few-rules',
    });
  });

  it('rejects a checksum mismatch', async () => {
    const checked: FilterSource = { ...source, checksum: 'expected' };
    await expect(validateText('||a^\n', checked, hash)).resolves.toEqual({
      ok: false,
      reason: 'checksum',
    });
  });
});

describe('FilterUpdater.updateNow', () => {
  it('stores the active descriptor and re-arms a daily alarm when all sources pass', async () => {
    const h = createHarness();
    setAll(h, VALID);

    await expect(h.updater.updateNow()).resolves.toEqual({ ok: true });

    await expect(h.updater.status()).resolves.toEqual({
      updatedAt: NOW,
      groups: {
        ads: { bytes: byteLength(VALID), rules: 2, checksum: `hash:${VALID.length}` },
        trackers: { bytes: byteLength(VALID), rules: 2, checksum: `hash:${VALID.length}` },
      },
      failures: 0,
    });
    expect(h.alarms).toEqual([{ delayMs: UPDATE_INTERVAL_MS, periodic: true }]);
  });

  it('keeps the previous set and backs off 1h on a network error', async () => {
    const h = createHarness();
    await h.storage.set('filterActive', OLD);
    setAll(h, new Error('boom'));

    const result = await h.updater.updateNow();

    expect(result).toEqual({ ok: false, reason: 'network', nextAttemptAt: NOW + BACKOFF_MS[0]! });
    // AC-7.2: the previous descriptor is untouched.
    await expect(h.storage.get('filterActive')).resolves.toEqual(OLD);
    await expect(h.storage.get('filterFailures')).resolves.toBe(1);
    expect(h.alarms).toEqual([{ delayMs: BACKOFF_MS[0], periodic: false }]);
  });

  it('keeps the previous set when the file is corrupt', async () => {
    const h = createHarness();
    await h.storage.set('filterActive', OLD);
    setAll(h, '\u0000not a filter list');

    await expect(h.updater.updateNow()).resolves.toMatchObject({ ok: false, reason: 'corrupt' });
    await expect(h.storage.get('filterActive')).resolves.toEqual(OLD);
  });

  it('keeps the previous set when the file is too large', async () => {
    const h = createHarness();
    await h.storage.set('filterActive', OLD);
    setAll(h, 'x'.repeat(2000));

    await expect(h.updater.updateNow()).resolves.toMatchObject({ ok: false, reason: 'too-large' });
    await expect(h.storage.get('filterActive')).resolves.toEqual(OLD);
  });

  it('does not swap when only one of several sources is bad', async () => {
    const h = createHarness();
    await h.storage.set('filterActive', OLD);
    h.setResponse(SOURCES[0]!.url, VALID);
    h.setResponse(SOURCES[1]!.url, new Error('boom'));

    await expect(h.updater.updateNow()).resolves.toMatchObject({ ok: false });

    // All-or-nothing: the good source must not have replaced the old set.
    await expect(h.storage.get('filterActive')).resolves.toEqual(OLD);
  });

  it('backs off 1h → 6h → 24h across consecutive failures', async () => {
    const h = createHarness();
    setAll(h, new Error('boom'));

    await h.updater.updateNow();
    await h.updater.updateNow();
    await h.updater.updateNow();
    await h.updater.updateNow();

    expect(h.alarms.map((alarm) => alarm.delayMs)).toEqual([
      BACKOFF_MS[0],
      BACKOFF_MS[1],
      BACKOFF_MS[2],
      BACKOFF_MS[2],
    ]);
    await expect(h.storage.get('filterFailures')).resolves.toBe(4);
  });

  it('resets the failure count after a later success', async () => {
    const h = createHarness();
    setAll(h, new Error('boom'));
    await h.updater.updateNow();

    setAll(h, VALID);
    await expect(h.updater.updateNow()).resolves.toEqual({ ok: true });

    await expect(h.updater.status()).resolves.toMatchObject({ failures: 0 });
    expect(h.alarms.at(-1)).toEqual({ delayMs: UPDATE_INTERVAL_MS, periodic: true });
  });
});

describe('FilterUpdater.scheduleInitial', () => {
  it('arms a daily alarm only when none exists', async () => {
    const missing = createHarness();
    await missing.updater.scheduleInitial();
    expect(missing.alarms).toEqual([{ delayMs: UPDATE_INTERVAL_MS, periodic: true }]);

    const present = createHarness();
    present.setExistingAlarm(true);
    await present.updater.scheduleInitial();
    expect(present.alarms).toEqual([]);
  });
});

describe('FilterUpdater.status', () => {
  it('reports an empty status before the first update', async () => {
    const h = createHarness();
    await expect(h.updater.status()).resolves.toEqual({
      updatedAt: undefined,
      groups: {},
      failures: 0,
    });
  });
});
