/**
 * Activity Center (Phase 4): the real, locally-stored block log.
 *
 * Records come from `ActivityLog`, which the worker fills from the same
 * `getMatchedRules` batch it counts. Nothing here leaves the machine; the
 * retention control, export and clear actions all work on local data only.
 */

import { createActivityLog } from '../background/activity';
import { t, type MessageKey } from '../shared/i18n';
import { logger } from '../shared/logger';
import type { ActivityEntry, BlockCategory } from '../shared/types';
import { q } from './elements';
import { download, type Ctx, type Section } from './ui';

/** Rows painted at once; the log itself is capped at 500. */
const ROW_LIMIT = 300;

const RETENTION_DAYS: readonly number[] = [0, 7, 30, 90, 365];

type FilterId = 'all' | BlockCategory;

const FILTERS: readonly { readonly id: FilterId; readonly key: MessageKey }[] = [
  { id: 'all', key: 'actFilterAll' },
  { id: 'ads', key: 'actFilterAds' },
  { id: 'trackers', key: 'actFilterTrackers' },
  { id: 'malware', key: 'actFilterSecurity' },
  { id: 'privacy', key: 'catPrivacy' },
  { id: 'other', key: 'catOther' },
];

function categoryKey(category: BlockCategory): MessageKey {
  switch (category) {
    case 'ads':
      return 'catAds';
    case 'trackers':
      return 'catTrackers';
    case 'malware':
      return 'catMalware';
    case 'privacy':
      return 'catPrivacy';
    default:
      return 'catOther';
  }
}

export function createActivity(ctx: Ctx): Section {
  const tabs = q('act-filters');
  const retention = q<HTMLSelectElement>('act-retention');
  const rows = q<HTMLTableSectionElement>('act-rows');
  const empty = q('act-empty');
  const topSites = q('act-top-sites');
  const totalEl = q('act-total');
  const adsEl = q('act-ads');
  const trackersEl = q('act-trackers');
  const securityEl = q('act-security');

  let filter: FilterId = 'all';
  let entries: readonly ActivityEntry[] = [];

  function renderTabs(): void {
    tabs.replaceChildren();
    for (const item of FILTERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = t(item.key, ctx.locale);
      button.setAttribute('aria-pressed', String(filter === item.id));
      button.addEventListener('click', () => {
        filter = item.id;
        renderTabs();
        renderRows();
      });
      tabs.append(button);
    }
  }

  function renderRows(): void {
    const shown = entries.filter((entry) => filter === 'all' || entry.category === filter);
    rows.replaceChildren();
    for (const entry of shown.slice(0, ROW_LIMIT)) {
      const row = document.createElement('tr');
      const cells = [
        new Date(entry.timeStamp).toLocaleString(ctx.locale),
        entry.host === '' ? '—' : entry.host,
        t(categoryKey(entry.category), ctx.locale),
        String(entry.ruleId),
        entry.rulesetId,
      ];
      for (const value of cells) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      rows.append(row);
    }
    empty.hidden = shown.length > 0;
  }

  function renderRetention(current: number): void {
    retention.replaceChildren();
    for (const days of RETENTION_DAYS) {
      const option = document.createElement('option');
      option.value = String(days);
      option.textContent =
        days === 0 ? t('actRetentionForever', ctx.locale) : t('actRetentionDays', ctx.locale, { days });
      option.selected = days === current;
      retention.append(option);
    }
  }

  async function refresh(): Promise<void> {
    const log = createActivityLog();
    entries = await log.list();
    const counts = await log.counts();
    totalEl.textContent = String(counts.total);
    adsEl.textContent = String(counts.byCategory['ads'] ?? 0);
    trackersEl.textContent = String(counts.byCategory['trackers'] ?? 0);
    securityEl.textContent = String(counts.byCategory['malware'] ?? 0);

    renderRetention(await log.retentionDays());
    if (tabs.childElementCount === 0) {
      renderTabs();
    }
    renderRows();

    topSites.replaceChildren();
    for (const item of await log.topHosts(8)) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'grow truncate';
      name.textContent = item.host;
      const count = document.createElement('span');
      count.className = 'chip off';
      count.textContent = String(item.count);
      li.append(name, count);
      topSites.append(li);
    }
  }

  retention.addEventListener('change', () => {
    void createActivityLog()
      .setRetentionDays(Number(retention.value))
      .then(refresh)
      .catch((error: unknown) => logger.error('retention change failed', error));
  });

  q('act-export').addEventListener('click', () => {
    const payload = JSON.stringify({ app: 'wale-guard', exportedAt: Date.now(), entries }, null, 2);
    download('wale-guard-activity.json', payload);
  });

  q('act-clear').addEventListener('click', () => {
    void (async () => {
      const ok = await ctx.confirm(t('actClear', ctx.locale), t('actEmptyDesc', ctx.locale), t('actClear', ctx.locale), true);
      if (!ok) {
        return;
      }
      await createActivityLog().clear();
      await refresh();
    })().catch((error: unknown) => logger.error('clear activity failed', error));
  });

  return { refresh };
}
