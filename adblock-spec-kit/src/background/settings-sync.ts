/**
 * T081 — optional settings sync (algorithm.md §T, US-16 / AC-16.2).
 *
 * Off by default. When the user turns it on, *configuration only* is mirrored
 * through `chrome.storage.sync`: the settings group, the whitelist and the
 * custom element selectors. Statistics, the activity log and browsing history
 * are never part of a group, so they cannot leak.
 *
 * Conflict rule (§T): every group carries an `updatedAt`; on a clash the newer
 * group wins, and `pull()` writes the winning groups back atomically in one
 * `apply()`. A group that cannot be pushed because it overflows the sync quota
 * is refused outright (no silent partial write). Any error leaves local state
 * untouched — the caller guards it.
 *
 * The local area and the sync area are injected so the merge/push logic is
 * unit-tested without a browser; `createSettingsSync` wires the real ones.
 */

import { TypedStorage, type StorageKey } from '../shared/storage';
import type { SettingsSyncGroup, SettingsSyncMeta, StorageSchema } from '../shared/types';

export type SyncGroupName = SettingsSyncGroup;

/**
 * Which local keys belong to each synced group. This allow-list is the whole
 * privacy story: anything not named here never leaves the device.
 */
export const SYNC_GROUPS: Readonly<Record<SyncGroupName, readonly StorageKey[]>> = {
  settings: [
    'enabled',
    'disabledRuleSets',
    'profile',
    'language',
    'theme',
    'notifications',
    'refererPolicy',
    'webrtcProtection',
    'antiFingerprint',
    'antiFingerprintOffSites',
    'youtubeModule',
    'activityRetentionDays',
    'customRules',
    'customLists',
    'bannerTrusted',
    'siteSettings',
  ],
  whitelist: ['whitelist'],
  customSelectors: ['hiddenSelectors'],
};

export const SYNC_GROUP_NAMES: readonly SyncGroupName[] = ['settings', 'whitelist', 'customSelectors'];

/** The single key the envelope occupies in `chrome.storage.sync`. */
export const SYNC_ENVELOPE_KEY = 'settingsSyncEnvelope';

/**
 * `chrome.storage.sync` quota, in bytes. `TODO(verify)` against the current
 * Chrome docs (QUOTA_BYTES); 100 KB is the long-standing value.
 */
export const SYNC_QUOTA_BYTES = 102_400;

/** Why a push was refused. */
export type PushResult = { readonly ok: true } | { readonly ok: false; readonly reason: 'too-large' };

export interface SyncGroupRecord {
  readonly updatedAt: number;
  readonly values: Readonly<Record<string, unknown>>;
}

export interface SyncEnvelope {
  readonly version: 1;
  readonly groups: Readonly<Partial<Record<SyncGroupName, SyncGroupRecord>>>;
}

/** The slice of `chrome.storage.sync` the module uses (injected for tests). */
export interface SyncArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const EMPTY_META: SettingsSyncMeta = { settings: 0, whitelist: 0, customSelectors: 0 };

/** Whether `key` belongs to any synced group (the worker's onChanged filter). */
export function isSyncedKey(key: string): boolean {
  return SYNC_GROUP_NAMES.some((name) => (SYNC_GROUPS[name] as readonly string[]).includes(key));
}

/** Validates a value read back from the sync area. */
export function isSyncEnvelope(value: unknown): value is SyncEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const groups = record['groups'];
  return record['version'] === 1 && typeof groups === 'object' && groups !== null;
}

/** Key-order-independent comparison, so "unchanged" is detected reliably. */
function sameValues(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean {
  const norm = (value: Readonly<Record<string, unknown>>): string =>
    JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]));
  return norm(a) === norm(b);
}

/** Serialised size of an envelope, in UTF-8 bytes. */
export function envelopeBytes(envelope: SyncEnvelope): number {
  return new TextEncoder().encode(JSON.stringify(envelope)).length;
}

/** Newer `updatedAt` wins; ties (or one side missing) prefer the local copy. */
export function resolveGroupRecord(
  local: SyncGroupRecord | undefined,
  remote: SyncGroupRecord | undefined,
): SyncGroupRecord | undefined {
  if (local === undefined) {
    return remote;
  }
  if (remote === undefined) {
    return local;
  }
  return remote.updatedAt > local.updatedAt ? remote : local;
}

export interface Resolution {
  readonly groups: Readonly<Partial<Record<SyncGroupName, SyncGroupRecord>>>;
  /** Groups whose winning value came from the remote copy. */
  readonly fromRemote: readonly SyncGroupName[];
}

/** Resolves every group and reports which remote values must be written locally. */
export function resolveEnvelope(local: SyncEnvelope, remote: SyncEnvelope): Resolution {
  const groups: Partial<Record<SyncGroupName, SyncGroupRecord>> = {};
  const fromRemote: SyncGroupName[] = [];
  for (const name of SYNC_GROUP_NAMES) {
    const winner = resolveGroupRecord(local.groups[name], remote.groups[name]);
    if (winner === undefined) {
      continue;
    }
    groups[name] = winner;
    if (winner === remote.groups[name]) {
      fromRemote.push(name);
    }
  }
  return { groups, fromRemote };
}

/** Mirrors the three configuration groups between devices. */
export class SettingsSync {
  constructor(
    private readonly local: TypedStorage,
    private readonly area: SyncArea,
  ) {}

  /** Whether sync is on; `false` (the default) means nothing is published. */
  async isEnabled(): Promise<boolean> {
    return (await this.local.get('settingsSync')) ?? false;
  }

  /** Publishes the user's choice (the options switch). */
  async setEnabled(enabled: boolean): Promise<void> {
    await this.local.set('settingsSync', enabled);
  }

  /** Reads the current local values of every group, stamped from the meta. */
  async collectLocal(): Promise<SyncEnvelope> {
    const meta = await this.readMeta();
    const groups: Partial<Record<SyncGroupName, SyncGroupRecord>> = {};
    for (const name of SYNC_GROUP_NAMES) {
      const values: Record<string, unknown> = {};
      for (const key of SYNC_GROUPS[name]) {
        const value = await this.local.get(key);
        if (value !== undefined) {
          values[key] = value;
        }
      }
      groups[name] = { updatedAt: meta[name], values };
    }
    return { version: 1, groups };
  }

  /**
   * Publishes local groups. A group whose values differ from the last published
   * copy is stamped with `now`; unchanged groups keep their timestamp so a
   * remote edit on another device can still win. Over-quota is refused.
   */
  async push(now: number): Promise<PushResult> {
    if (!(await this.isEnabled())) {
      return { ok: true };
    }
    const local = await this.collectLocal();
    const published = await this.readRemote();
    const groups: Partial<Record<SyncGroupName, SyncGroupRecord>> = {};
    for (const name of SYNC_GROUP_NAMES) {
      const group = local.groups[name];
      if (group === undefined) {
        continue;
      }
      const previous = published?.groups[name];
      const unchanged = previous !== undefined && sameValues(previous.values, group.values);
      groups[name] = { updatedAt: unchanged ? previous.updatedAt : now, values: group.values };
    }
    const envelope: SyncEnvelope = { version: 1, groups };
    if (envelopeBytes(envelope) > SYNC_QUOTA_BYTES) {
      return { ok: false, reason: 'too-large' };
    }
    await this.area.set({ [SYNC_ENVELOPE_KEY]: envelope });
    return { ok: true };
  }

  /** Applies any newer remote groups locally and returns the ones that won. */
  async pull(): Promise<readonly SyncGroupName[]> {
    if (!(await this.isEnabled())) {
      return [];
    }
    const remote = await this.readRemote();
    if (remote === undefined) {
      return [];
    }
    const local = await this.collectLocal();
    const { groups, fromRemote } = resolveEnvelope(local, remote);
    if (fromRemote.length === 0) {
      return [];
    }
    const meta: Record<SyncGroupName, number> = { ...(await this.readMeta()) };
    for (const name of fromRemote) {
      const group = groups[name];
      if (group === undefined) {
        continue;
      }
      await this.applyGroup(name, group.values);
      meta[name] = group.updatedAt;
    }
    await this.writeMeta(meta);
    return fromRemote;
  }

  /** Mirrors one group exactly: present keys are written, absent ones removed. */
  private async applyGroup(
    name: SyncGroupName,
    values: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const items: Partial<Record<StorageKey, unknown>> = {};
    for (const key of SYNC_GROUPS[name]) {
      if (key in values) {
        items[key] = values[key];
      } else {
        await this.local.remove(key);
      }
    }
    if (Object.keys(items).length > 0) {
      await this.local.apply(items as Partial<StorageSchema>);
    }
  }

  private async readMeta(): Promise<SettingsSyncMeta> {
    return (await this.local.get('settingsSyncMeta')) ?? EMPTY_META;
  }

  private async writeMeta(meta: SettingsSyncMeta): Promise<void> {
    await this.local.set('settingsSyncMeta', meta);
  }

  private async readRemote(): Promise<SyncEnvelope | undefined> {
    const items = await this.area.get(SYNC_ENVELOPE_KEY);
    const value = items[SYNC_ENVELOPE_KEY];
    return isSyncEnvelope(value) ? value : undefined;
  }
}

/** Builds the manager backed by the real `chrome.storage.local`/`.sync`. */
export function createSettingsSync(): SettingsSync {
  return new SettingsSync(new TypedStorage(), chrome.storage.sync);
}
