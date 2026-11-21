/**
 * Filter management (Phase 5): the static ruleset groups, the update system and
 * the user's custom filter-list entries.
 *
 * The toggles drive the real `RulesetManager`; the update row drives the real
 * `FilterUpdater` (24h schedule, backoff, "never overwrite good data"). Custom
 * list URLs are stored as metadata only in v1 — the shipped lists do not read
 * them yet, and the UI says so rather than pretending otherwise.
 */

import { createFilterUpdater } from '../background/filter-updater';
import { createRulesetManager } from '../background/ruleset-manager';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import type { CustomList } from '../shared/types';
import { q } from './elements';
import { describeUpdateResult, formatTimestamp, groupLabel } from './format';
import type { Ctx, Section } from './ui';

const URL_RE = /^https?:\/\/\S+$/i;

export function createFilters(ctx: Ctx): Section {
  const groupList = q('group-list');
  const failChip = q('flt-fail-chip');
  const updateStatus = q('update-status');
  const updateNow = q<HTMLButtonElement>('update-now');
  const progress = q('flt-progress');
  const progressBar = progress.querySelector('i');
  const last = q('flt-last');
  const next = q('flt-next');
  const failures = q('flt-failures');
  const customName = q<HTMLInputElement>('flt-custom-name');
  const customUrl = q<HTMLInputElement>('flt-custom-url');
  const customList = q('flt-custom-list');
  const customEmpty = q('flt-custom-empty');

  let lists: readonly CustomList[] = [];

  async function refreshGroups(): Promise<void> {
    const rulesets = createRulesetManager();
    const ids = rulesets.listGroups();
    const enabledById = new Map<string, boolean>();
    for (const id of ids) {
      enabledById.set(id, await rulesets.isGroupEnabled(id));
    }
    groupList.replaceChildren();
    for (const id of ids) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset['group'] = id;
      checkbox.checked = enabledById.get(id) ?? false;
      checkbox.addEventListener('change', () => {
        void rulesets
          .setGroupEnabled(id, checkbox.checked)
          .catch((error: unknown) => logger.error('group toggle failed', error));
      });
      const label = document.createElement('label');
      label.append(checkbox, document.createTextNode(` ${groupLabel(id, ctx.locale)}`));
      const item = document.createElement('li');
      item.append(label);
      groupList.append(item);
    }
  }

  async function refreshStatus(): Promise<void> {
    const status = await createFilterUpdater().status();
    updateStatus.textContent = formatTimestamp(status.updatedAt, ctx.locale);
    last.textContent =
      status.updatedAt === undefined
        ? t('optionsNeverUpdated', ctx.locale)
        : t('fltLastSuccess', ctx.locale, {
            time: new Date(status.updatedAt).toLocaleString(ctx.locale),
          });
    const nextAt = await ctx.storage.get('filterNextAttemptAt');
    next.textContent =
      nextAt === undefined || nextAt <= 0
        ? ''
        : t('fltNext', ctx.locale, { time: new Date(nextAt).toLocaleString(ctx.locale) });
    failures.hidden = status.failures === 0;
    failures.textContent = t('fltFailures', ctx.locale, { count: status.failures });
    failChip.hidden = status.failures === 0;
    failChip.textContent = t('fltFailures', ctx.locale, { count: status.failures });
  }

  async function runUpdate(): Promise<void> {
    updateNow.disabled = true;
    updateStatus.textContent = t('optionsUpdating', ctx.locale);
    progress.hidden = false;
    if (progressBar !== null) {
      progressBar.style.width = '100%';
    }
    try {
      const result = await createFilterUpdater().updateNow();
      updateStatus.textContent = describeUpdateResult(result, ctx.locale);
      await refreshStatus();
    } catch (error) {
      logger.error('manual filter update failed', error);
      updateStatus.textContent = t('optionsUpdateFailed', ctx.locale);
    } finally {
      updateNow.disabled = false;
      progress.hidden = true;
      if (progressBar !== null) {
        progressBar.style.width = '0';
      }
    }
  }

  function renderCustom(): void {
    customList.replaceChildren();
    customEmpty.hidden = lists.length > 0;
    for (const list of lists) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'grow truncate';
      name.textContent = list.name;
      const url = document.createElement('span');
      url.className = 'small muted mono truncate';
      url.textContent = list.url;
      item.append(name, url);
      if (list.rules !== undefined) {
        const rules = document.createElement('span');
        rules.className = 'chip off';
        rules.textContent = t('fltRules', ctx.locale, { count: list.rules });
        item.append(rules);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn ghost sm';
      remove.textContent = t('gRemove', ctx.locale);
      remove.addEventListener('click', () => {
        lists = lists.filter((entry) => entry.id !== list.id);
        void persistCustom();
      });
      item.append(remove);
      customList.append(item);
    }
  }

  async function persistCustom(): Promise<void> {
    await ctx.storage.set('customLists', [...lists]);
    renderCustom();
  }

  function addCustom(): void {
    const name = customName.value.trim();
    const url = customUrl.value.trim();
    if (name === '' || !URL_RE.test(url)) {
      ctx.toast(t('dataImportInvalid', ctx.locale), 'err');
      return;
    }
    lists = [
      ...lists,
      { id: `custom-${Date.now()}-${lists.length}`, name, url, enabled: true },
    ];
    customName.value = '';
    customUrl.value = '';
    void persistCustom().catch((error: unknown) => logger.error('save custom list failed', error));
  }

  async function refresh(): Promise<void> {
    await refreshGroups();
    await refreshStatus();
    lists = (await ctx.storage.get('customLists')) ?? [];
    renderCustom();
  }

  updateNow.addEventListener('click', () => {
    void runUpdate().catch((error: unknown) => logger.error('update action failed', error));
  });
  q('flt-add-custom').addEventListener('click', addCustom);

  return { refresh };
}
