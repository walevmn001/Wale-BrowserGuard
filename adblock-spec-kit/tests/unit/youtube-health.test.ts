import { describe, expect, it } from 'vitest';

import {
  HEALTH_FAULT_LIMIT,
  HEALTH_FAULT_WINDOW_MS,
  readHealthState,
  recordHealthFault,
} from '../../src/background/youtube-health';
import { TypedStorage } from '../../src/shared/storage';

/**
 * Q5 decision logic (algorithm.md §Q5): two faults inside the window drop the
 * Q2 prune for the session, a fault after that turns the whole module off, and
 * faults older than the window are forgotten. The storage is a fake so the
 * session semantics are exercised without a browser.
 */
function createStorage(): TypedStorage {
  const store = new Map<string, unknown>();
  const area = {
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
  return new TypedStorage(area);
}

describe('readHealthState', () => {
  it('is healthy when nothing has been stored yet', async () => {
    const storage = createStorage();

    await expect(readHealthState(storage)).resolves.toEqual({
      q2Disabled: false,
      moduleDisabled: false,
    });
  });
});

describe('recordHealthFault', () => {
  it('counts the first fault without degrading (N = 2)', async () => {
    const storage = createStorage();

    const result = await recordHealthFault(storage, 1_000);

    expect(result.degrade).toBe('none');
    expect(result.state).toEqual({ q2Disabled: false, moduleDisabled: false });
  });

  it('drops the Q2 prune on the second fault in the window', async () => {
    const storage = createStorage();
    await recordHealthFault(storage, 1_000);

    const result = await recordHealthFault(storage, 2_000);

    expect(result.degrade).toBe('q2');
    expect(result.state).toEqual({ q2Disabled: true, moduleDisabled: false });
    await expect(readHealthState(storage)).resolves.toEqual({
      q2Disabled: true,
      moduleDisabled: false,
    });
  });

  it('turns the whole module off on a fault after the Q2 drop', async () => {
    const storage = createStorage();
    await recordHealthFault(storage, 1_000);
    await recordHealthFault(storage, 2_000);

    const result = await recordHealthFault(storage, 3_000);

    expect(result.degrade).toBe('module');
    expect(result.state).toEqual({ q2Disabled: true, moduleDisabled: true });
  });

  it('keeps the module off once it was degraded (no further escalation)', async () => {
    const storage = createStorage();
    await recordHealthFault(storage, 1_000);
    await recordHealthFault(storage, 2_000);
    await recordHealthFault(storage, 3_000);

    const result = await recordHealthFault(storage, 4_000);

    expect(result.degrade).toBe('none');
    expect(result.state).toEqual({ q2Disabled: true, moduleDisabled: true });
  });

  it('forgets faults older than the window before counting', async () => {
    const storage = createStorage();
    await recordHealthFault(storage, 0);
    // Exactly one window later, the first fault is stale: this one is "first".
    const now = HEALTH_FAULT_WINDOW_MS;

    const result = await recordHealthFault(storage, now);

    expect(result.degrade).toBe('none');
  });

  it('drops the Q2 prune on two fresh faults even when a stale one exists', async () => {
    const storage = createStorage();
    await recordHealthFault(storage, 0); // becomes stale later
    const start = HEALTH_FAULT_WINDOW_MS;

    await recordHealthFault(storage, start);
    const result = await recordHealthFault(storage, start + 1);

    expect(result.degrade).toBe('q2');
    expect(HEALTH_FAULT_LIMIT).toBe(2);
  });
});
