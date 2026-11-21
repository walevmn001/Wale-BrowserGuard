/**
 * Local activity log (Phase 4).
 *
 * DNR does not report the blocked URL, so each record keeps what the browser
 * *does* give us — the matching ruleset/rule, the tab, the timestamp — plus the
 * page host resolved at poll time. The log is capped and age-trimmed so it can
 * never grow without bound, and it never leaves the machine (Constitution II).
 */

import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';
import type { ActivityEntry, BlockCategory } from '../shared/types';

/** Newest-first cap; older records are dropped once this many are kept. */
export const ACTIVITY_LIMIT = 500;
/** Default retention: 30 days. */
export const DEFAULT_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActivityCounts {
  readonly total: number;
  readonly byCategory: Readonly<Record<string, number>>;
}

export interface HostCount {
  readonly host: string;
  readonly count: number;
}

export interface ActivityLogDeps {
  readonly storage: TypedStorage;
  readonly now?: () => number;
}

export class ActivityLog {
  private readonly deps: ActivityLogDeps;

  constructor(deps: ActivityLogDeps) {
    this.deps = deps;
  }

  /** Every stored record, newest first. */
  async list(): Promise<ActivityEntry[]> {
    return [...((await this.deps.storage.get('activity')) ?? [])];
  }

  /** Retention window in days; `0` keeps records forever. */
  async retentionDays(): Promise<number> {
    return (await this.deps.storage.get('activityRetentionDays')) ?? DEFAULT_RETENTION_DAYS;
  }

  async setRetentionDays(days: number): Promise<void> {
    await this.deps.storage.set('activityRetentionDays', Math.max(0, Math.floor(days)));
  }

  /** Prepends `entries` (newest first) and trims by retention and cap. */
  async record(entries: readonly ActivityEntry[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    const now = this.deps.now?.() ?? Date.now();
    const days = await this.retentionDays();
    const cutoff = days === 0 ? 0 : now - days * DAY_MS;
    const kept = [...entries, ...((await this.deps.storage.get('activity')) ?? [])]
      .filter((entry) => entry.timeStamp >= cutoff)
      .slice(0, ACTIVITY_LIMIT);
    await this.deps.storage.set('activity', kept);
    logger.info(`activity: +${entries.length} logged (kept ${kept.length})`);
  }

  async clear(): Promise<void> {
    await this.deps.storage.remove('activity');
    logger.info('activity: cleared');
  }

  /** Totals and per-category breakdown derived from the stored records. */
  async counts(): Promise<ActivityCounts> {
    const byCategory: Record<string, number> = {};
    const entries = await this.list();
    for (const entry of entries) {
      byCategory[entry.category] = (byCategory[entry.category] ?? 0) + 1;
    }
    return { total: entries.length, byCategory };
  }

  /** Number of records in one category. */
  async countCategory(category: BlockCategory): Promise<number> {
    return (await this.counts()).byCategory[category] ?? 0;
  }

  /** The hosts (pages) that produced the most blocked requests, capped at `limit`. */
  async topHosts(limit = 5): Promise<HostCount[]> {
    const tally = new Map<string, number>();
    for (const entry of await this.list()) {
      if (entry.host === '') {
        continue;
      }
      tally.set(entry.host, (tally.get(entry.host) ?? 0) + 1);
    }
    return [...tally.entries()]
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}

/** Builds a log backed by the real `chrome.*` storage. */
export function createActivityLog(): ActivityLog {
  return new ActivityLog({ storage: new TypedStorage() });
}
