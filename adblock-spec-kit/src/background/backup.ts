/**
 * Local configuration backup & restore (Phase 9 §6).
 *
 * Exports only user *configuration* — never statistics or the activity log,
 * which are privacy-sensitive and local-only. Import re-validates everything:
 * a backup file is untrusted input, so unknown keys are dropped, types are
 * checked, and no value is ever evaluated as code (Constitution 11, 13).
 */

import type { StorageSchema } from '../shared/types';

/** Marker so a JSON file can be recognised as ours. */
export const BACKUP_APP = 'wale-guard';
export const BACKUP_VERSION = 1;

/** Configuration keys that may be exported/imported (everything else is local-only). */
export const BACKUP_KEYS = [
  'enabled',
  'disabledRuleSets',
  'whitelist',
  'profile',
  'language',
  'theme',
  'notifications',
  'refererPolicy',
  'webrtcProtection',
  'antiFingerprint',
  'antiFingerprintOffSites',
  'customRules',
  'siteSettings',
  'hiddenSelectors',
  'activityRetentionDays',
] as const;

export type BackupKey = (typeof BACKUP_KEYS)[number];

export interface BackupFile {
  readonly app: typeof BACKUP_APP;
  readonly version: number;
  readonly exportedAt: number;
  readonly data: Partial<Pick<StorageSchema, BackupKey>>;
}

/** Builds the JSON text for a backup of `data`. */
export function serializeBackup(
  data: Partial<Pick<StorageSchema, BackupKey>>,
  now = Date.now(),
): string {
  const file: BackupFile = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now, data };
  return JSON.stringify(file, null, 2);
}

export type BackupParseResult =
  | { readonly ok: true; readonly data: Partial<Pick<StorageSchema, BackupKey>> }
  | { readonly ok: false; readonly reason: 'invalid' };

/** Parses and validates a backup file, dropping anything unrecognised. */
export function parseBackup(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!isRecord(raw) || raw['app'] !== BACKUP_APP) {
    return { ok: false, reason: 'invalid' };
  }
  const source = isRecord(raw['data']) ? raw['data'] : {};
  const data: Record<string, unknown> = {};
  for (const key of BACKUP_KEYS) {
    const value = source[key];
    if (value !== undefined && isAllowed(key, value)) {
      data[key] = value;
    }
  }
  return { ok: true, data: data as Partial<Pick<StorageSchema, BackupKey>> };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Runtime type gate per key — never trust a file's own shape. */
function isAllowed(key: BackupKey, value: unknown): boolean {
  switch (key) {
    case 'enabled':
    case 'webrtcProtection':
    case 'antiFingerprint':
      return typeof value === 'boolean';
    case 'disabledRuleSets':
    case 'whitelist':
    case 'antiFingerprintOffSites':
      return Array.isArray(value) && value.every((item) => typeof item === 'string');
    case 'activityRetentionDays':
      return typeof value === 'number' && Number.isFinite(value);
    case 'profile':
      return value === 'balanced' || value === 'strict' || value === 'custom';
    case 'language':
      return value === 'auto' || value === 'vi' || value === 'en';
    case 'theme':
      return value === 'system' || value === 'light' || value === 'dark';
    case 'refererPolicy':
      return value === 'default' || value === 'third-party';
    case 'notifications':
      return (
        isRecord(value) &&
        ['filterUpdate', 'securityBlock', 'protectionOff', 'errors'].every(
          (flag) => typeof value[flag] === 'boolean',
        )
      );
    case 'customRules':
      return Array.isArray(value);
    case 'siteSettings':
    case 'hiddenSelectors':
      return isRecord(value);
    default:
      return false;
  }
}
