/**
 * Local block counter (T015, US-3 / AC-3.1, AC-3.2).
 *
 * DNR does not expose a per-rule hit counter for static rules; the documented
 * way to learn which rules matched is `declarativeNetRequest.getMatchedRules`,
 * which needs the `declarativeNetRequestFeedback` permission (plan.md §3). It
 * returns the matches since a timestamp, so we poll with a stored cursor and
 * add the deltas to a per-tab and an overall total.
 *
 * Known API limits (docs, Chrome): only rules matched in the last 5 minutes and
 * associated with an active document are returned, and calls are capped at
 * `MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL` (20) per 10 minutes. TODO(verify):
 * revisit cadence once the popup can poll on demand (T016). Nothing ever leaves
 * the machine (Constitution II). Counts and cursor live in `chrome.storage`; the
 * only module variable is the poll queue that serialises overlapping polls
 * (Constitution 14).
 */

import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';

/**
 * Serialises polls within one context. The read-modify-write on `chrome.storage`
 * is not atomic, so two overlapping polls would both read the same cursor and
 * count the same matches twice. This is transient coordination only — it holds
 * no user state and is safe to lose when the worker suspends (Constitution 14).
 */
let pollQueue: Promise<unknown> = Promise.resolve();

/** Counts to show in the popup. */
export interface StatsSnapshot {
  readonly total: number;
  readonly byTab: Readonly<Record<string, number>>;
}

export interface StatsDeps {
  readonly storage: TypedStorage;
  readonly getMatchedRules: (
    filter?: chrome.declarativeNetRequest.MatchedRulesFilter,
  ) => Promise<chrome.declarativeNetRequest.RulesMatchedDetails>;
}

export class StatsCounter {
  private readonly deps: StatsDeps;

  constructor(deps: StatsDeps) {
    this.deps = deps;
  }

  /**
   * Counts the rules matched since the stored cursor and adds them to the
   * totals. Returns how many were newly counted. Safe to call repeatedly: the
   * cursor is the newest counted timestamp and matches at or before it are
   * dropped, so nothing is counted twice. Overlapping calls are queued so only
   * one read-modify-write runs at a time.
   */
  poll(): Promise<number> {
    const run = pollQueue.then(() => this.pollOnce());
    pollQueue = run.catch(() => undefined);
    return run;
  }

  private async pollOnce(): Promise<number> {
    const cursor = (await this.deps.storage.get('statsCursor')) ?? 0;
    const { rulesMatchedInfo } = await this.deps.getMatchedRules({ minTimeStamp: cursor });
    // `getMatchedRules` returns matches *at or after* `minTimeStamp`, so the
    // newest match from the previous poll comes back too. Keep only the
    // strictly newer ones to avoid counting it again.
    const fresh = rulesMatchedInfo.filter((info) => info.timeStamp > cursor);
    if (fresh.length === 0) {
      return 0;
    }

    const byTab: Record<string, number> = { ...(await this.deps.storage.get('statsByTab')) };
    let newest = cursor;
    for (const info of fresh) {
      const key = String(info.tabId);
      byTab[key] = (byTab[key] ?? 0) + 1;
      if (info.timeStamp > newest) {
        newest = info.timeStamp;
      }
    }

    const total = ((await this.deps.storage.get('statsTotal')) ?? 0) + fresh.length;
    await this.deps.storage.set('statsByTab', byTab);
    await this.deps.storage.set('statsTotal', total);
    await this.deps.storage.set('statsCursor', newest);
    logger.info(`stats: +${fresh.length} blocked (total ${total})`);
    return fresh.length;
  }

  /** Current totals: overall and per tab. */
  async snapshot(): Promise<StatsSnapshot> {
    return {
      total: (await this.deps.storage.get('statsTotal')) ?? 0,
      byTab: { ...(await this.deps.storage.get('statsByTab')) },
    };
  }

  /** Blocked requests counted for one tab. */
  async forTab(tabId: number): Promise<number> {
    const byTab = await this.deps.storage.get('statsByTab');
    return byTab?.[String(tabId)] ?? 0;
  }

  /**
   * Clears the counters (AC-3.2). The cursor is left untouched so matches
   * already counted are not added again on the next poll.
   */
  async reset(): Promise<void> {
    await this.deps.storage.set('statsTotal', 0);
    await this.deps.storage.set('statsByTab', {});
    logger.info('stats: reset');
  }
}

/** Builds a counter backed by the real `chrome.*` APIs (used by the worker). */
export function createStatsCounter(): StatsCounter {
  return new StatsCounter({
    storage: new TypedStorage(),
    getMatchedRules: (filter) => chrome.declarativeNetRequest.getMatchedRules(filter),
  });
}
