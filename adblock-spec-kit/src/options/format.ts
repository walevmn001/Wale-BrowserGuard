/**
 * Pure rendering helpers for the options page (T024).
 *
 * Kept free of DOM and `chrome.*` so the label and status logic is unit-testable
 * without a browser; `options.ts` only wires them to the page.
 */

import type { UpdateResult } from '../background/filter-updater';
import { t, type Locale, type MessageKey } from '../shared/i18n';
import type { FilterGroupInfo } from '../shared/types';

/** i18n keys for the ruleset groups we ship; unknown ids fall back to the id. */
const GROUP_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  ads: 'optionsGroupAds',
  trackers: 'optionsGroupTrackers',
  malware: 'optionsGroupMalware',
  privacy: 'optionsGroupPrivacy',
};

/** Human-readable label for a static ruleset group. */
export function groupLabel(id: string, locale: Locale): string {
  const key = GROUP_LABEL_KEYS[id];
  return key === undefined ? id : t(key, locale);
}

/** "Never updated" or the localised time of the last successful update. */
export function formatTimestamp(updatedAt: number | undefined, locale: Locale): string {
  if (updatedAt === undefined) {
    return t('optionsNeverUpdated', locale);
  }
  return t('optionsUpdatedAt', locale, { time: new Date(updatedAt).toLocaleString(locale) });
}

/** Outcome message for a manual update (AC-7.1, AC-7.2). */
export function describeUpdateResult(result: UpdateResult, locale: Locale): string {
  return t(result.ok ? 'optionsUpdateOk' : 'optionsUpdateFailed', locale);
}

/** Visual tone for a protection state (maps onto `.status` / `.dot` classes). */
export type ProtectionTone = 'on' | 'warn' | 'danger' | 'off';

/** The overall protection state, shared by the top bar and the overview card. */
export function statusKey(master: boolean, paused: boolean, failures: number): MessageKey {
  if (paused) {
    return 'statusPaused';
  }
  if (!master) {
    return 'statusOff';
  }
  if (failures > 0) {
    return 'statusAttention';
  }
  return 'statusProtected';
}

/** The tone that goes with {@link statusKey}. */
export function statusTone(master: boolean, paused: boolean, failures: number): ProtectionTone {
  if (paused) {
    return 'warn';
  }
  if (!master) {
    return 'off';
  }
  return failures > 0 ? 'warn' : 'on';
}

/** Label key for a protection profile. */
export function profileKey(profile: string): MessageKey {
  if (profile === 'strict') {
    return 'profStrict';
  }
  if (profile === 'custom') {
    return 'profCustom';
  }
  return 'profBalanced';
}

/** Total rules across the active groups, plus how many groups there are. */
export function summarizeGroups(groups: Readonly<Record<string, FilterGroupInfo>>): {
  rules: number;
  groups: number;
} {
  const entries = Object.values(groups);
  return {
    rules: entries.reduce((sum, group) => sum + group.rules, 0),
    groups: entries.length,
  };
}
