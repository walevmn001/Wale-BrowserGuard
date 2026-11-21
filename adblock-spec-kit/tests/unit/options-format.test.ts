import { describe, expect, it } from 'vitest';

import {
  describeUpdateResult,
  formatTimestamp,
  groupLabel,
  summarizeGroups,
} from '../../src/options/format';

describe('groupLabel', () => {
  it('maps known ruleset ids to a localised label', () => {
    expect(groupLabel('ads', 'en')).toBe('Ads');
    expect(groupLabel('trackers', 'vi')).toBe('Trình theo dõi');
  });

  it('falls back to the raw id for unknown groups', () => {
    expect(groupLabel('custom', 'en')).toBe('custom');
  });
});

describe('formatTimestamp', () => {
  it('reports the never-updated state when there is no timestamp', () => {
    expect(formatTimestamp(undefined, 'en')).toBe('Never updated');
    expect(formatTimestamp(undefined, 'vi')).toBe('Chưa cập nhật');
  });

  it('embeds the localised date once there is a timestamp', () => {
    const text = formatTimestamp(Date.UTC(2026, 0, 2, 3, 4, 5), 'en');
    expect(text).toContain('Last updated:');
    expect(text).toContain('2026');
  });
});

describe('describeUpdateResult', () => {
  it('reports success and failure distinctly', () => {
    expect(describeUpdateResult({ ok: true }, 'en')).toBe('Filter lists updated');
    expect(describeUpdateResult({ ok: false, reason: 'network' }, 'en')).toBe(
      'Update failed — keeping the previous set',
    );
  });
});

describe('summarizeGroups', () => {
  it('totals the rules and counts the groups', () => {
    expect(
      summarizeGroups({
        ads: { bytes: 1, rules: 10, checksum: 'a' },
        trackers: { bytes: 2, rules: 5, checksum: 'b' },
      }),
    ).toEqual({ rules: 15, groups: 2 });
  });

  it('reports zero before the first update', () => {
    expect(summarizeGroups({})).toEqual({ rules: 0, groups: 0 });
  });
});
