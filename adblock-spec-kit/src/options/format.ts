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
