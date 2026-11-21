import { describe, expect, it } from 'vitest';

import {
  envelopeBytes,
  isSyncedKey,
  isSyncEnvelope,
  resolveEnvelope,
  SettingsSync,
  SYNC_ENVELOPE_KEY,
  SYNC_GROUPS,
  SYNC_GROUP_NAMES,
  SYNC_QUOTA_BYTES,
  type SyncArea,
  type SyncEnvelope,
} from '../../src/background/settings-sync';
import { TypedStorage } from '../../src/shared/storage';

/**
 * T081 — settings sync (algorithm.md §T, AC-16.2).
 *
 * The local and sync areas are fakes, so the whole push/pull/merge path runs
 * without a browser: only configuration groups are ever published, a conflict
 * is resolved per group by `updatedAt`, and an over-quota push is refused.
 */

type Store = Map<string, unknown>;

function createLocal(store: Store = new Map()): { storage: TypedStorage; store: Store } {
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
  return { storage: new TypedStorage(area), store };
}

function createSync(store: Store = new Map()): { area: SyncArea; store: Store } {
  const area: SyncArea = {
    get: async (key: string): Promise<Record<string, unknown>> =>
      store.has(key) ? { [key]: store.get(key) } : {},
    set: async (items: Record<string, unknown>): Promise<void> => {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
    },
  };
  return { area, store };
}

function readEnvelope(store: Store): SyncEnvelope {
  const value = store.get(SYNC_ENVELOPE_KEY);
  if (!isSyncEnvelope(value)) {
    throw new Error('no envelope was written');
  }
  return value;
}

describe('sync groups', () => {
  it('never includes statistics, the activity log or history (AC-16.2)', () => {
    const keys = SYNC_GROUP_NAMES.flatMap((name) => SYNC_GROUPS[name]);

    for (const forbidden of [
      'statsTotal',
      'statsByTab',
      'statsCursor',
      'statsCategories',
      'statsToday',
      'activity',
      'tempExceptions',
      'filterActive',
    ]) {
      expect(keys).not.toContain(forbidden);
      expect(isSyncedKey(forbidden)).toBe(false);
    }
  });

  it('names the configuration groups as syncable', () => {
    expect(isSyncedKey('whitelist')).toBe(true);
    expect(isSyncedKey('hiddenSelectors')).toBe(true);
    expect(isSyncedKey('enabled')).toBe(true);
  });
});

describe('push', () => {
  it('publishes nothing while sync is off (the default)', async () => {
    const { storage, store } = createLocal();
    await storage.set('whitelist', ['example.com']);
    const { area, store: syncStore } = createSync();
    const sync = new SettingsSync(storage, area);

    await expect(sync.push(1_000)).resolves.toEqual({ ok: true });

    expect(store.get('whitelist')).toEqual(['example.com']);
    expect(syncStore.size).toBe(0);
  });

  it('publishes only the configuration groups', async () => {
    const { storage } = createLocal();
    await storage.set('settingsSync', true);
    await storage.set('enabled', true);
    await storage.set('whitelist', ['example.com']);
    await storage.set('statsTotal', 999); // local-only
    await storage.set('activity', [
      { host: 'x', category: 'ads', rulesetId: 'ads', ruleId: 1, tabId: 1, timeStamp: 1 },
    ]); // local-only
    const { area, store: syncStore } = createSync();
    const sync = new SettingsSync(storage, area);

    await sync.push(1_000);

    const envelope = readEnvelope(syncStore);
    expect(envelope.groups.whitelist?.values).toEqual({ whitelist: ['example.com'] });
    expect(envelope.groups.settings?.values).toEqual({ enabled: true });
    const serialised = JSON.stringify(envelope);
    expect(serialised).not.toContain('statsTotal');
    expect(serialised).not.toContain('activity');
  });

  it('refuses a payload that overflows the sync quota', async () => {
    const { storage } = createLocal();
    await storage.set('settingsSync', true);
    await storage.set('whitelist', ['a'.repeat(SYNC_QUOTA_BYTES + 10)]);
    const { area, store: syncStore } = createSync();
    const sync = new SettingsSync(storage, area);

    await expect(sync.push(1_000)).resolves.toEqual({ ok: false, reason: 'too-large' });

    expect(syncStore.size).toBe(0);
  });

  it('keeps an unchanged group’s timestamp so a remote edit can still win', async () => {
    const { storage } = createLocal();
    await storage.set('settingsSync', true);
    await storage.set('whitelist', ['example.com']);
    const { area, store: syncStore } = createSync();
    const sync = new SettingsSync(storage, area);

    await sync.push(1_000);
    await sync.push(2_000); // nothing changed

    expect(readEnvelope(syncStore).groups.whitelist?.updatedAt).toBe(1_000);
    expect(envelopeBytes(readEnvelope(syncStore))).toBeLessThanOrEqual(SYNC_QUOTA_BYTES);
  });
});

describe('resolveEnvelope', () => {
  it('picks the newer group on each side independently', () => {
    const local: SyncEnvelope = {
      version: 1,
      groups: {
        settings: { updatedAt: 5, values: { a: 'local' } },
        whitelist: { updatedAt: 9, values: { whitelist: ['local'] } },
      },
    };
    const remote: SyncEnvelope = {
      version: 1,
      groups: {
        settings: { updatedAt: 10, values: { a: 'remote' } },
        whitelist: { updatedAt: 2, values: { whitelist: ['remote'] } },
      },
    };

    const { groups, fromRemote } = resolveEnvelope(local, remote);

    expect(groups.settings?.values).toEqual({ a: 'remote' });
    expect(groups.whitelist?.values).toEqual({ whitelist: ['local'] });
    expect(fromRemote).toEqual(['settings']);
  });

  it('prefers the local copy on an exact tie', () => {
    const group = { updatedAt: 7, values: { a: 'local' } };
    const local: SyncEnvelope = { version: 1, groups: { settings: group } };
    const remote: SyncEnvelope = {
      version: 1,
      groups: { settings: { updatedAt: 7, values: { a: 'remote' } } },
    };

    const { groups, fromRemote } = resolveEnvelope(local, remote);

    expect(groups.settings?.values).toEqual({ a: 'local' });
    expect(fromRemote).toEqual([]);
  });
});

describe('pull', () => {
  it('applies newer remote groups locally and ignores older ones', async () => {
    const { storage, store } = createLocal();
    await storage.set('settingsSync', true);
    await storage.set('whitelist', ['local.example']);
    await storage.set('enabled', true);
    await storage.set('settingsSyncMeta', { settings: 50, whitelist: 0, customSelectors: 0 });
    const { area } = createSync(
      new Map<string, unknown>([
        [
          SYNC_ENVELOPE_KEY,
          {
            version: 1,
            groups: {
              whitelist: { updatedAt: 100, values: { whitelist: ['remote.example'] } },
              settings: { updatedAt: 1, values: { enabled: false } },
            },
          } satisfies SyncEnvelope,
        ],
      ]),
    );
    const sync = new SettingsSync(storage, area);

    const changed = await sync.pull();

    expect(changed).toEqual(['whitelist']);
    expect(store.get('whitelist')).toEqual(['remote.example']);
    expect(store.get('enabled')).toBe(true); // older remote ignored
    expect(store.get('settingsSyncMeta')).toEqual({ settings: 50, whitelist: 100, customSelectors: 0 });
  });

  it('does nothing while sync is off', async () => {
    const { storage, store } = createLocal();
    await storage.set('whitelist', ['local.example']);
    const { area } = createSync(
      new Map<string, unknown>([
        [
          SYNC_ENVELOPE_KEY,
          { version: 1, groups: { whitelist: { updatedAt: 100, values: { whitelist: ['remote'] } } } },
        ],
      ]),
    );
    const sync = new SettingsSync(storage, area);

    await expect(sync.pull()).resolves.toEqual([]);
    expect(store.get('whitelist')).toEqual(['local.example']);
  });

  it('carries settings from one device to another', async () => {
    const a = createLocal();
    await a.storage.set('settingsSync', true);
    await a.storage.set('enabled', true);
    await a.storage.set('whitelist', ['shared.example']);
    const shared = createSync();
    await new SettingsSync(a.storage, shared.area).push(1_000);

    const b = createLocal();
    await b.storage.set('settingsSync', true);
    const changed = await new SettingsSync(b.storage, shared.area).pull();

    expect(changed).toContain('whitelist');
    expect(b.store.get('whitelist')).toEqual(['shared.example']);
    expect(b.store.get('enabled')).toBe(true);
  });
});
